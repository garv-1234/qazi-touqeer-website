-- =====================================================================
-- Step 2 — booking engine
--   * Requester-only moves enforced inside transition_booking
--   * create_booking also saves uploaded attachments (same transaction)
--   * OTP issue / check with send limits and attempt counting
--   * submit_payment (UTR) and requester_reply, each atomic
--   * published_events() with live seats left
-- =====================================================================

create index if not exists otp_codes_ip_idx on public.otp_codes (ip_hash, created_at desc) where ip_hash is not null;
create index if not exists bookings_ip_idx on public.bookings (ip_hash, created_at desc) where ip_hash is not null;

-- Moves a requester (not staff) may make. Mirrored in src/lib/booking/status.ts
-- (REQUESTER_TRANSITIONS): reply to an info request, send a UTR, cancel before paying.
create or replace function public.is_requester_transition(
  from_s public.booking_status, to_s public.booking_status)
returns boolean language sql immutable as $$
  select (from_s = 'info_requested' and to_s = 'in_review')
      or (from_s = 'payment_pending' and to_s = 'payment_submitted')
      or (to_s = 'cancelled' and from_s in ('submitted', 'waitlisted', 'in_review',
                                            'info_requested', 'payment_pending'))
$$;

-- Same as the init version, plus: requesters are limited to their own moves
-- and cannot change payment terms or the owner.
create or replace function public.transition_booking(
  p_booking_id  uuid,
  p_to          public.booking_status,
  p_actor_type  public.actor_type,
  p_actor_id    uuid default null,
  p_reason      text default null,
  p_patch       jsonb default '{}'::jsonb   -- optional: advance_amount, payment_deadline, owner_id
)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_b      public.bookings;
  v_event  public.events;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;

  if p_actor_type = 'requester' then
    if not public.is_requester_transition(v_b.status, p_to) then
      raise exception 'Requester cannot move a booking from % to %', v_b.status, p_to
        using errcode = 'check_violation';
    end if;
    p_patch := '{}'::jsonb;
  end if;

  if v_b.category = 'fan_meetup'
     and public.seat_holding(p_to) and not public.seat_holding(v_b.status) then
    select * into v_event from public.events where id = v_b.event_id for update;
    if public.event_seats_left(v_event.id) < v_b.party_size then
      raise exception 'No seats left for this meetup' using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('app.actor_type', p_actor_type::text, true);
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);

  update public.bookings b set
    status           = p_to,
    is_waitlist      = case when p_to = 'submitted' then false else b.is_waitlist end,
    advance_amount   = coalesce((p_patch ->> 'advance_amount')::numeric, b.advance_amount),
    payment_deadline = coalesce((p_patch ->> 'payment_deadline')::timestamptz, b.payment_deadline),
    owner_id         = coalesce((p_patch ->> 'owner_id')::uuid, b.owner_id)
  where b.id = p_booking_id
  returning * into v_b;

  return v_b;
end $$;

-- Same as the init version, plus p -> 'attachments':
-- [{kind, storage_path, mime_type, size_bytes}], saved with the booking.
create or replace function public.create_booking(p jsonb)
returns table (id uuid, booking_code text, status public.booking_status)
language plpgsql security definer set search_path = public as $$
declare
  v_cat     public.booking_category := (p ->> 'category')::public.booking_category;
  v_event   public.events;
  v_party   integer := coalesce((p ->> 'party_size')::integer, 1);
  v_status  public.booking_status := 'submitted';
  v_min     numeric;
  v_budget  numeric := nullif(p ->> 'budget', '')::numeric;
  v_row     public.bookings;
begin
  if v_cat = 'fan_meetup' then
    select * into v_event from public.events e
      where e.id = (p ->> 'event_id')::uuid
      for update;
    if not found or v_event.status <> 'published' or v_event.starts_at <= now() then
      raise exception 'This meetup is not open for booking' using errcode = 'check_violation';
    end if;
    if public.event_seats_left(v_event.id) < v_party then
      v_status := 'waitlisted';
    end if;
  end if;

  select c.min_budget into v_min from public.categories c where c.code = v_cat and c.active;
  if not found then
    raise exception 'Category % is not accepting requests', v_cat using errcode = 'check_violation';
  end if;

  perform set_config('app.actor_type', 'requester', true);
  perform set_config('app.reason', case when v_status = 'waitlisted' then 'Event full at submission' else '' end, true);

  insert into public.bookings (
    booking_code, category, status, name, phone, phone_verified_at, email, city,
    preferred_date, backup_date, source, details, event_id, party_size, is_waitlist,
    budget, below_minimum, consent_version, consent_at, ip_hash)
  values (
    public.next_booking_code(), v_cat, v_status,
    p ->> 'name', p ->> 'phone', (p ->> 'phone_verified_at')::timestamptz, p ->> 'email', p ->> 'city',
    nullif(p ->> 'preferred_date', '')::date, nullif(p ->> 'backup_date', '')::date, p ->> 'source',
    coalesce(p -> 'details', '{}'::jsonb),
    case when v_cat = 'fan_meetup' then v_event.id end,
    v_party, v_status = 'waitlisted',
    v_budget, (v_min is not null and v_budget is not null and v_budget < v_min),
    p ->> 'consent_version', now(), p ->> 'ip_hash')
  returning * into v_row;

  insert into public.attachments (booking_id, kind, storage_path, mime_type, size_bytes)
  select v_row.id, a ->> 'kind', a ->> 'storage_path', a ->> 'mime_type', (a ->> 'size_bytes')::integer
  from jsonb_array_elements(coalesce(p -> 'attachments', '[]'::jsonb)) a;

  return query select v_row.id, v_row.booking_code, v_row.status;
end $$;

-- ---------------------------------------------------------------------
-- OTP (FR-B5, FR-B8). Phone and code arrive already hashed by the server.
-- ---------------------------------------------------------------------

-- Records a new code unless a send limit is hit:
-- 5 sends per phone per hour, 20 per IP per hour.
-- Returns 'ok', 'phone_limit' or 'ip_limit'.
create or replace function public.issue_otp(
  p_phone_hash  text,
  p_purpose     public.otp_purpose,
  p_code_hash   text,
  p_ip_hash     text default null,
  p_ttl_seconds integer default 600)
returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('otp:' || p_phone_hash, 0));

  if (select count(*) from public.otp_codes
      where phone_hash = p_phone_hash and created_at > now() - interval '1 hour') >= 5 then
    return 'phone_limit';
  end if;
  if p_ip_hash is not null and (select count(*) from public.otp_codes
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 20 then
    return 'ip_limit';
  end if;

  insert into public.otp_codes (phone_hash, code_hash, purpose, expires_at, ip_hash)
  values (p_phone_hash, p_code_hash, p_purpose, now() + make_interval(secs => p_ttl_seconds), p_ip_hash);
  return 'ok';
end $$;

-- Checks a code against the latest one sent for this phone and purpose.
-- Each check counts as an attempt (max 5); a code works once.
-- result: 'ok', 'invalid', 'expired', 'too_many' or 'none'.
create or replace function public.check_otp(
  p_phone_hash text, p_purpose public.otp_purpose, p_code_hash text)
returns table (result text, attempts_left integer)
language plpgsql security definer set search_path = public as $$
declare
  v public.otp_codes;
begin
  select * into v from public.otp_codes o
  where o.phone_hash = p_phone_hash and o.purpose = p_purpose
  order by o.created_at desc limit 1
  for update;

  if not found or v.verified_at is not null then
    return query select 'none'::text, 0; return;
  end if;
  if v.expires_at <= now() then
    return query select 'expired'::text, 0; return;
  end if;
  if v.attempts >= 5 then
    return query select 'too_many'::text, 0; return;
  end if;

  update public.otp_codes o set
    attempts = o.attempts + 1,
    verified_at = case when v.code_hash = p_code_hash then now() end
  where o.id = v.id;

  if v.code_hash = p_code_hash then
    return query select 'ok'::text, 4 - v.attempts;
  elsif v.attempts + 1 >= 5 then
    return query select 'too_many'::text, 0;
  else
    return query select 'invalid'::text, 4 - v.attempts;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Requester actions from Track My Booking
-- ---------------------------------------------------------------------

-- Saves the UTR and moves Payment pending -> Payment submitted (FR-P3).
-- A reused UTR fails on payments_utr_unique (FR-P4).
create or replace function public.submit_payment(
  p_booking_id   uuid,
  p_method       public.payment_method,
  p_amount_paid  numeric,
  p_utr          text,
  p_paid_on      date,
  p_screenshot   jsonb default null)   -- {storage_path, mime_type, size_bytes}
returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_b  public.bookings;
  v_p  public.payments;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;
  if v_b.status <> 'payment_pending' then
    raise exception 'This booking is not waiting for a payment' using errcode = 'check_violation';
  end if;
  if v_b.advance_amount is null then
    raise exception 'No advance amount set for this booking' using errcode = 'check_violation';
  end if;
  if p_method = 'razorpay' then
    raise exception 'Online payments are not available yet' using errcode = 'check_violation';
  end if;

  insert into public.payments (booking_id, method, amount_due, amount_paid, utr, paid_on, screenshot_path)
  values (p_booking_id, p_method, v_b.advance_amount, p_amount_paid, upper(p_utr), p_paid_on,
          p_screenshot ->> 'storage_path')
  returning * into v_p;

  if p_screenshot is not null then
    insert into public.attachments (booking_id, kind, storage_path, mime_type, size_bytes)
    values (p_booking_id, 'payment_screenshot', p_screenshot ->> 'storage_path',
            p_screenshot ->> 'mime_type', (p_screenshot ->> 'size_bytes')::integer);
  end if;

  perform public.transition_booking(p_booking_id, 'payment_submitted', 'requester', null,
                                    'UTR ' || upper(p_utr));
  return v_p;
end $$;

-- Requester answers an info request: saves the reply as a visible note and
-- moves Info requested -> In review.
create or replace function public.requester_reply(p_booking_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status public.booking_status;
begin
  select status into v_status from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'no_data_found';
  end if;
  if v_status <> 'info_requested' then
    raise exception 'This booking is not waiting for a reply' using errcode = 'check_violation';
  end if;

  insert into public.booking_notes (booking_id, author_type, body, internal)
  values (p_booking_id, 'requester', p_body, false);

  perform public.transition_booking(p_booking_id, 'in_review', 'requester', null, 'Requester replied');
end $$;

-- ---------------------------------------------------------------------
-- Public events list with live seats left (FR-W5)
-- ---------------------------------------------------------------------
create or replace function public.published_events()
returns table (id uuid, title text, city text, venue text, starts_at timestamptz,
               ends_at timestamptz, capacity integer, ticket_price numeric, seats_left integer)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.city, e.venue, e.starts_at, e.ends_at, e.capacity, e.ticket_price,
         greatest(public.event_seats_left(e.id), 0)
  from public.events e
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at
$$;

-- Server only.
revoke all on function public.issue_otp(text, public.otp_purpose, text, text, integer) from public, anon, authenticated;
revoke all on function public.check_otp(text, public.otp_purpose, text) from public, anon, authenticated;
revoke all on function public.submit_payment(uuid, public.payment_method, numeric, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.requester_reply(uuid, text) from public, anon, authenticated;
revoke all on function public.published_events() from public, anon, authenticated;
grant execute on function public.issue_otp(text, public.otp_purpose, text, text, integer) to service_role;
grant execute on function public.check_otp(text, public.otp_purpose, text) to service_role;
grant execute on function public.submit_payment(uuid, public.payment_method, numeric, text, date, jsonb) to service_role;
grant execute on function public.requester_reply(uuid, text) to service_role;
grant execute on function public.published_events() to service_role;
