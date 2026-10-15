-- =====================================================================
-- "Reject payment + also extend the deadline by 24 hours" may be used at
-- most twice per booking. Separate from the one "Extend deadline" action.
-- =====================================================================

alter table public.bookings
  add column reject_extensions_used integer not null default 0
    check (reject_extensions_used between 0 and 2);

-- Same as 20261019000000_admin_core.sql, except reject_payment counts and
-- caps the 24-hour extension (mirrored in src/lib/admin/actions.ts).
create or replace function public.staff_action(
  p_actor     uuid,
  p_booking   uuid,
  p_action    text,
  p_input     jsonb default '{}'::jsonb,
  p_expected  timestamptz default null   -- bookings.updated_at the page was loaded with
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff     public.staff_profiles;
  v_b         public.bookings;
  v_after     public.bookings;
  v_event     public.events;
  v_pay       public.payments;
  v_owner     public.staff_profiles;
  v_before    jsonb;
  v_extra     jsonb := '{}'::jsonb;
  v_text      text;
  v_msg       text := nullif(btrim(coalesce(p_input ->> 'message', '')), '');
  v_code      text;
  v_amount    numeric;
  v_deadline  timestamptz;
  v_base      timestamptz;
  v_decision  text;
begin
  -- Who is acting
  select * into v_staff from public.staff_profiles where user_id = p_actor and active;
  if not found then
    raise exception 'This account doesn''t have access.' using errcode = 'QT403';
  end if;

  select * into v_b from public.bookings where id = p_booking for update;
  if not found or not (v_staff.role in ('super_admin', 'admin', 'client_approver')
                       or (v_staff.role = 'category_manager' and v_b.category = any (v_staff.categories))) then
    raise exception 'Request not found' using errcode = 'QT404';
  end if;

  -- Who may do what (mirrored in src/lib/admin/actions.ts)
  if p_action = 'client_decide' then
    if v_staff.role not in ('client_approver', 'super_admin') then
      raise exception 'Only the client approver can record this.' using errcode = 'QT403';
    end if;
  elsif p_action in ('mark_paid', 'reject_payment') then
    if v_staff.role not in ('super_admin', 'admin') then
      raise exception 'Only a Super admin or Admin can confirm payments.' using errcode = 'QT403';
    end if;
  elsif p_action = 'add_note' then
    null;
  elsif p_action in ('assign', 'start_review', 'request_info', 'flag_client', 'approve', 'decline',
                     'extend_deadline', 'release', 'offer_seat', 'complete', 'cancel') then
    if v_staff.role not in ('super_admin', 'admin', 'category_manager') then
      raise exception 'Your role can''t do this.' using errcode = 'QT403';
    end if;
  else
    raise exception 'Unknown action %', p_action using errcode = 'QT422';
  end if;

  -- The page must be current (two people can't act on stale information)
  if p_action <> 'add_note' and (p_expected is null or v_b.updated_at <> p_expected) then
    raise exception 'This request has changed since you opened it. Reload to see its current status.'
      using errcode = 'QT409';
  end if;

  v_before := public.booking_snapshot(v_b);

  case p_action
  -- -------------------------------------------------------------------
  when 'assign' then
    if v_b.status in ('completed', 'declined', 'expired', 'cancelled') then
      raise exception 'This request is closed.' using errcode = 'QT422';
    end if;
    select * into v_owner from public.staff_profiles
      where user_id = (p_input ->> 'owner_id')::uuid and active
        and (role in ('super_admin', 'admin') or (role = 'category_manager' and v_b.category = any (categories)));
    if not found then
      raise exception 'Choose someone who can see this category.' using errcode = 'QT422';
    end if;
    update public.bookings set owner_id = v_owner.user_id where id = p_booking;

  -- -------------------------------------------------------------------
  when 'start_review' then
    if v_b.status <> 'submitted' then
      raise exception 'Only new requests can be reviewed.' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'in_review', 'staff', p_actor, 'Review started',
                                      jsonb_build_object('owner_id', coalesce(v_b.owner_id, p_actor)));

  -- -------------------------------------------------------------------
  when 'request_info' then
    v_text := btrim(coalesce(p_input ->> 'question', ''));
    if v_b.status <> 'in_review' then
      raise exception 'You can ask for information while the request is in review.' using errcode = 'QT422';
    end if;
    if length(v_text) not between 10 and 1000 then
      raise exception 'Write a question of 10 to 1,000 characters.' using errcode = 'QT422';
    end if;
    insert into public.booking_notes (booking_id, author_type, author_id, body, internal)
    values (p_booking, 'staff', p_actor, v_text, false);
    perform public.transition_booking(p_booking, 'info_requested', 'staff', p_actor, 'Information requested');
    perform public.queue_message(p_booking, 'info_requested', jsonb_build_object('question', v_text));

  -- -------------------------------------------------------------------
  when 'flag_client' then
    if v_b.status not in ('in_review', 'info_requested') then
      raise exception 'Flag a request while it''s in review.' using errcode = 'QT422';
    end if;
    if v_b.needs_client_approval and v_b.client_decision is null then
      raise exception 'This request is already waiting for client sign-off.' using errcode = 'QT422';
    end if;
    update public.bookings set
      needs_client_approval = true, client_decision = null, client_decided_by = null,
      client_decided_at = null, client_comment = null,
      client_note = nullif(btrim(coalesce(p_input ->> 'note', '')), '')
    where id = p_booking;
    perform public.queue_message(p_booking, 'team_client_signoff',
      jsonb_build_object('note', nullif(btrim(coalesce(p_input ->> 'note', '')), '')), 'client_approvers');

  -- -------------------------------------------------------------------
  when 'approve' then
    if v_b.status <> 'in_review' then
      raise exception 'Only a request in review can be approved.' using errcode = 'QT422';
    end if;
    if v_b.needs_client_approval and v_b.client_decision is distinct from 'approved' then
      raise exception '%', case when v_b.client_decision = 'declined'
        then 'The client declined this request.' else 'Waiting for client sign-off.' end using errcode = 'QT422';
    end if;
    if not public.payment_details_ready() then
      raise exception 'Add payment details in Settings first.' using errcode = 'QT422';
    end if;
    v_amount := (p_input ->> 'advance_amount')::numeric;
    v_deadline := (p_input ->> 'payment_deadline')::timestamptz;
    if v_amount is null or v_amount < 1 or v_amount > 100000000 or v_amount <> trunc(v_amount) then
      raise exception 'Enter the advance in whole rupees.' using errcode = 'QT422';
    end if;
    if v_deadline is null or v_deadline < now() + interval '1 hour' or v_deadline > now() + interval '14 days' then
      raise exception 'The deadline must be at least 1 hour and at most 14 days away.' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'payment_pending', 'staff', p_actor, 'Approved',
      jsonb_build_object('advance_amount', v_amount, 'payment_deadline', v_deadline,
                         'owner_id', coalesce(v_b.owner_id, p_actor)));
    perform public.queue_message(p_booking, 'payment_pending',
      jsonb_build_object('amount', v_amount, 'deadline', v_deadline, 'message', v_msg));

  -- -------------------------------------------------------------------
  when 'decline' then
    v_code := p_input ->> 'reason';
    if v_b.status not in ('submitted', 'waitlisted', 'in_review', 'info_requested') then
      raise exception 'This request can''t be declined now.' using errcode = 'QT422';
    end if;
    if public.reason_text('decline', v_code) is null then
      raise exception 'Choose a reason.' using errcode = 'QT422';
    end if;
    if v_code = 'other' and v_msg is null then
      raise exception 'Add a message for "Other".' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'declined', 'staff', p_actor,
      'Declined: ' || coalesce(case when v_code = 'other' then v_msg end, public.reason_text('decline', v_code)));
    perform public.queue_message(p_booking, 'declined', jsonb_build_object(
      'reason', v_code, 'reason_text', public.reason_text('decline', v_code), 'message', v_msg));

  -- -------------------------------------------------------------------
  when 'mark_paid' then
    if v_b.status <> 'payment_submitted' then
      raise exception 'There is no payment waiting to be checked.' using errcode = 'QT422';
    end if;
    if coalesce((p_input ->> 'found_utr')::boolean, false) is not true
       or coalesce((p_input ->> 'amount_ok')::boolean, false) is not true then
      raise exception 'Tick both boxes to confirm you checked the payment.' using errcode = 'QT422';
    end if;
    select * into v_pay from public.payments
      where booking_id = p_booking and status = 'submitted' order by created_at desc limit 1 for update;
    if not found then
      raise exception 'There is no payment waiting to be checked.' using errcode = 'QT422';
    end if;
    if v_pay.amount_paid < v_pay.amount_due then
      raise exception 'Amount is short. Reject the payment with the reason ''Amount doesn''t match''.' using errcode = 'QT422';
    end if;
    update public.payments set status = 'verified', verified_by = p_actor, verified_at = now() where id = v_pay.id;
    perform public.transition_booking(p_booking, 'confirmed', 'staff', p_actor, 'Payment verified (UTR ' || v_pay.utr || ')');
    perform public.queue_message(p_booking, 'confirmed', jsonb_build_object('amount_paid', v_pay.amount_paid, 'utr', v_pay.utr));
    v_extra := jsonb_build_object('payment', jsonb_build_object('id', v_pay.id, 'utr', v_pay.utr,
                 'amount_paid', v_pay.amount_paid, 'amount_due', v_pay.amount_due, 'status', 'verified'));

  -- -------------------------------------------------------------------
  when 'reject_payment' then
    v_code := p_input ->> 'reason';
    if v_b.status <> 'payment_submitted' then
      raise exception 'There is no payment waiting to be checked.' using errcode = 'QT422';
    end if;
    if public.reason_text('reject_payment', v_code) is null then
      raise exception 'Choose a reason.' using errcode = 'QT422';
    end if;
    if v_code = 'other' and v_msg is null then
      raise exception 'Add a message for "Other".' using errcode = 'QT422';
    end if;
    if coalesce((p_input ->> 'extend_24h')::boolean, false) and v_b.reject_extensions_used >= 2 then
      raise exception 'The deadline has already been extended twice when rejecting a payment.' using errcode = 'QT422';
    end if;
    select * into v_pay from public.payments
      where booking_id = p_booking and status = 'submitted' order by created_at desc limit 1 for update;
    v_text := coalesce(case when v_code = 'other' then v_msg end, public.reason_text('reject_payment', v_code));
    update public.payments set status = 'rejected', verified_by = p_actor, verified_at = now(), reject_reason = v_text
      where id = v_pay.id;
    v_deadline := null;
    if coalesce((p_input ->> 'extend_24h')::boolean, false) then
      v_deadline := greatest(v_b.payment_deadline, now()) + interval '24 hours';
      update public.bookings set reject_extensions_used = reject_extensions_used + 1 where id = p_booking;
    end if;
    perform public.transition_booking(p_booking, 'payment_pending', 'staff', p_actor, 'Payment rejected: ' || v_text,
      case when v_deadline is not null then jsonb_build_object('payment_deadline', v_deadline) else '{}'::jsonb end);
    perform public.queue_message(p_booking, 'payment_rejected', jsonb_build_object(
      'reason', v_code, 'reason_text', public.reason_text('reject_payment', v_code), 'message', v_msg,
      'deadline', coalesce(v_deadline, v_b.payment_deadline)));
    v_extra := jsonb_build_object('payment', jsonb_build_object('id', v_pay.id, 'utr', v_pay.utr, 'status', 'rejected', 'reason', v_text));

  -- -------------------------------------------------------------------
  when 'extend_deadline' then
    if v_b.status <> 'payment_pending' then
      raise exception 'Only a booking awaiting payment can be extended.' using errcode = 'QT422';
    end if;
    if v_b.deadline_extended then
      raise exception 'The deadline has already been extended once.' using errcode = 'QT422';
    end if;
    v_deadline := (p_input ->> 'payment_deadline')::timestamptz;
    v_base := greatest(v_b.payment_deadline, now());
    if v_deadline is null or v_deadline <= v_b.payment_deadline or v_deadline < now() + interval '1 hour'
       or v_deadline > v_base + interval '7 days' then
      raise exception 'Choose a new deadline after the current one, at most 7 days later.' using errcode = 'QT422';
    end if;
    update public.bookings set payment_deadline = v_deadline, deadline_extended = true where id = p_booking;
    perform public.queue_message(p_booking, 'deadline_extended', jsonb_build_object('deadline', v_deadline));

  -- -------------------------------------------------------------------
  when 'release' then
    if v_b.status <> 'payment_pending' or v_b.payment_deadline is null or v_b.payment_deadline > now() then
      raise exception 'Only an overdue booking can be released.' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'expired', 'staff', p_actor,
      coalesce('Slot released: ' || v_msg, 'Slot released after the deadline'));
    perform public.queue_message(p_booking, 'expired', '{}'::jsonb);

  -- -------------------------------------------------------------------
  when 'offer_seat' then
    if v_b.status <> 'waitlisted' then
      raise exception 'Only a waitlisted request can be offered a seat.' using errcode = 'QT422';
    end if;
    select * into v_event from public.events where id = v_b.event_id for update;
    if public.event_seats_left(v_b.event_id) < v_b.party_size then
      raise exception 'No seats left for this meetup. Keep it on the waitlist or decline.' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'submitted', 'staff', p_actor, 'Seat offered from the waitlist');
    perform public.queue_message(p_booking, 'seat_available', '{}'::jsonb);

  -- -------------------------------------------------------------------
  when 'complete' then
    if v_b.status <> 'confirmed' then
      raise exception 'Only a confirmed booking can be completed.' using errcode = 'QT422';
    end if;
    if v_b.event_id is not null then
      select * into v_event from public.events where id = v_b.event_id;
      if v_event.starts_at > now() then
        raise exception 'You can mark this completed after the event date.' using errcode = 'QT422';
      end if;
    elsif v_b.preferred_date is not null and v_b.preferred_date >= (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'You can mark this completed after the event date.' using errcode = 'QT422';
    end if;
    perform public.transition_booking(p_booking, 'completed', 'staff', p_actor, 'Completed');

  -- -------------------------------------------------------------------
  when 'cancel' then
    v_text := btrim(coalesce(p_input ->> 'reason', ''));
    if v_b.status in ('completed', 'declined', 'expired', 'cancelled') then
      raise exception 'This request is already closed.' using errcode = 'QT422';
    end if;
    if v_staff.role = 'category_manager' and v_b.status in ('payment_submitted', 'confirmed') then
      raise exception 'Only a Super admin or Admin can cancel after payment.' using errcode = 'QT403';
    end if;
    if length(v_text) not between 2 and 500 then
      raise exception 'Give a reason for cancelling.' using errcode = 'QT422';
    end if;
    if v_b.status in ('payment_submitted', 'confirmed') then
      v_decision := p_input ->> 'refund';
      if v_decision is null or v_decision not in ('full', 'partial', 'none') then
        raise exception 'Choose a refund decision.' using errcode = 'QT422';
      end if;
      v_amount := case v_decision
        when 'full' then coalesce((select sum(amount_paid) from public.payments
                                   where booking_id = p_booking and status <> 'rejected'), 0)
        when 'partial' then (p_input ->> 'refund_amount')::numeric
        else 0 end;
      if v_decision = 'partial' and (v_amount is null or v_amount < 1) then
        raise exception 'Enter the partial refund amount.' using errcode = 'QT422';
      end if;
      update public.bookings set refund_decision = v_decision, refund_amount = v_amount where id = p_booking;
    end if;
    perform public.transition_booking(p_booking, 'cancelled', 'staff', p_actor, 'Cancelled: ' || v_text);
    perform public.queue_message(p_booking, 'cancelled', jsonb_build_object(
      'reason', v_text, 'refund', v_decision, 'refund_amount', v_amount));
    perform public.queue_message(p_booking, 'team_booking_cancelled', jsonb_build_object('reason', v_text), 'admins');

  -- -------------------------------------------------------------------
  when 'client_decide' then
    v_decision := p_input ->> 'decision';
    if not v_b.needs_client_approval or v_b.client_decision is not null then
      raise exception 'There is no client sign-off waiting on this request.' using errcode = 'QT422';
    end if;
    if v_decision is null or v_decision not in ('approved', 'declined') then
      raise exception 'Choose approve or decline.' using errcode = 'QT422';
    end if;
    update public.bookings set
      client_decision = v_decision::public.client_decision, client_decided_by = p_actor, client_decided_at = now(),
      client_comment = nullif(btrim(coalesce(p_input ->> 'comment', '')), '')
    where id = p_booking;
    perform public.queue_message(p_booking, 'team_client_decision', jsonb_build_object(
      'decision', v_decision, 'comment', nullif(btrim(coalesce(p_input ->> 'comment', '')), ''),
      'on_behalf', v_staff.role = 'super_admin'), 'owner');

  -- -------------------------------------------------------------------
  when 'add_note' then
    v_text := btrim(coalesce(p_input ->> 'body', ''));
    if length(v_text) not between 1 and 5000 then
      raise exception 'Write a note of up to 5,000 characters.' using errcode = 'QT422';
    end if;
    insert into public.booking_notes (booking_id, author_type, author_id, body, internal)
    values (p_booking, 'staff', p_actor, v_text, true);
  end case;

  select * into v_after from public.bookings where id = p_booking;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (p_actor, 'booking.' || p_action, 'booking', v_b.booking_code, v_before,
          public.booking_snapshot(v_after) || v_extra || jsonb_build_object('input', coalesce(p_input, '{}'::jsonb)));

  return jsonb_build_object('status', v_after.status, 'updated_at', v_after.updated_at);
end $$;
