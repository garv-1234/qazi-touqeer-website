-- =====================================================================
-- Booking forms spec (docs/specs/booking-forms.md)
--   * Fan meetups stop taking requests 24 hours before they start
--   * published_events() says whether each meetup is still bookable
-- =====================================================================

-- Same as 20261017000000_booking_engine.sql, except the meetup cut-off:
-- a meetup starting in under 24 hours is no longer open for booking.
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
    if not found or v_event.status <> 'published' or v_event.starts_at <= now() + interval '24 hours' then
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

-- Adds bookings_open (false within 24 hours of the start); the return type
-- changes, so the function is dropped and recreated.
drop function public.published_events();
create function public.published_events()
returns table (id uuid, title text, city text, venue text, starts_at timestamptz,
               ends_at timestamptz, capacity integer, ticket_price numeric, seats_left integer,
               bookings_open boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.city, e.venue, e.starts_at, e.ends_at, e.capacity, e.ticket_price,
         greatest(public.event_seats_left(e.id), 0),
         e.starts_at > now() + interval '24 hours'
  from public.events e
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at
$$;
revoke all on function public.published_events() from public, anon, authenticated;
grant execute on function public.published_events() to service_role;
