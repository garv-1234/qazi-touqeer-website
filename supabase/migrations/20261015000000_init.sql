-- =====================================================================
-- Qazi Touqeer website — Phase 1 initial schema
-- Run once on a fresh Supabase project (SQL editor or `supabase db push`).
--
-- Principles
--   * Row-level security is ON for every table.
--   * Public visitors never touch tables directly: every public action goes
--     through a Next.js server route that uses the service role key.
--   * Staff read through RLS with their own login; staff writes also go
--     through server routes, which check the role first.
--   * The database itself enforces: valid status moves, status history,
--     no meetup overbooking, one open request per phone per category,
--     and no reused payment reference (UTR).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.staff_role as enum ('super_admin', 'admin', 'category_manager', 'client_approver');
create type public.booking_category as enum ('podcast', 'fan_meetup', 'misc_event');
create type public.booking_status as enum (
  'submitted', 'waitlisted', 'in_review', 'info_requested',
  'payment_pending', 'payment_submitted', 'confirmed', 'completed',
  'declined', 'expired', 'cancelled'
);
create type public.actor_type as enum ('staff', 'requester', 'system');
create type public.advance_type as enum ('percent', 'fixed', 'ticket_price');
create type public.event_status as enum ('draft', 'published', 'closed');
create type public.payment_method as enum ('upi', 'bank_transfer', 'razorpay');
create type public.payment_status as enum ('submitted', 'verified', 'rejected');
create type public.message_channel as enum ('whatsapp', 'email', 'sms');
create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type public.otp_purpose as enum ('submit', 'track');
create type public.client_decision as enum ('approved', 'declined');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------
create table public.staff_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        public.staff_role not null,
  categories  public.booking_category[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger staff_profiles_updated before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- Role of the logged-in user (null if not active staff).
create or replace function public.current_staff_role()
returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.staff_profiles
  where user_id = auth.uid() and active
$$;

-- Can the logged-in staff member see bookings of this category?
create or replace function public.staff_can_see(cat public.booking_category)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_profiles s
    where s.user_id = auth.uid() and s.active
      and (s.role in ('super_admin', 'admin', 'client_approver')
           or (s.role = 'category_manager' and cat = any (s.categories)))
  )
$$;

-- ---------------------------------------------------------------------
-- Categories and their rules
-- ---------------------------------------------------------------------
create table public.categories (
  code            public.booking_category primary key,
  name            text not null,
  advance_type    public.advance_type not null,
  advance_value   numeric(12, 2) not null default 0,   -- percent (0-100) or rupees
  hold_hours      integer not null check (hold_hours > 0),
  min_budget      numeric(12, 2),                      -- rupees; null = no minimum
  response_time   text not null default 'Within 3 working days',
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Fan meetup events
-- ---------------------------------------------------------------------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  city          text not null,
  venue         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  capacity      integer not null check (capacity > 0),
  ticket_price  numeric(12, 2) not null default 0 check (ticket_price >= 0),
  status        public.event_status not null default 'draft',
  notes         text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_status_starts_idx on public.events (status, starts_at);
create trigger events_updated before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------
create table public.booking_code_counters (
  yymm  text primary key,
  last  integer not null
);

create table public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  booking_code           text not null unique,
  category               public.booking_category not null references public.categories (code),
  status                 public.booking_status not null default 'submitted',

  -- requester
  name                   text not null check (length(name) between 2 and 120),
  phone                  text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  phone_verified_at      timestamptz not null,
  email                  text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city                   text,
  preferred_date         date,
  backup_date            date,
  source                 text,
  details                jsonb not null default '{}'::jsonb,   -- category-specific answers

  -- fan meetup
  event_id               uuid references public.events (id),
  party_size             integer not null default 1 check (party_size between 1 and 2),
  is_waitlist            boolean not null default false,

  -- screening
  budget                 numeric(12, 2),
  below_minimum          boolean not null default false,
  needs_client_approval  boolean not null default false,
  client_decision        public.client_decision,
  client_decided_by      uuid references auth.users (id),
  client_decided_at      timestamptz,
  owner_id               uuid references auth.users (id),

  -- payment terms (set on approval)
  advance_amount         numeric(12, 2) check (advance_amount >= 0),
  payment_deadline       timestamptz,
  deadline_extended      boolean not null default false,
  last_reminder_at       timestamptz,

  -- consent
  consent_version        text not null,
  consent_at             timestamptz not null,
  ip_hash                text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint meetup_needs_event check (category <> 'fan_meetup' or event_id is not null)
);
create index bookings_status_idx on public.bookings (status);
create index bookings_category_status_idx on public.bookings (category, status);
create index bookings_event_idx on public.bookings (event_id) where event_id is not null;
create index bookings_deadline_idx on public.bookings (payment_deadline) where status = 'payment_pending';
create index bookings_phone_idx on public.bookings (phone);

-- One open request per phone per category (FR-B7).
create unique index bookings_one_open_per_phone_category
  on public.bookings (phone, category)
  where status in ('submitted', 'waitlisted', 'in_review', 'info_requested',
                   'payment_pending', 'payment_submitted');

create trigger bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- Allowed status moves (single source of truth; mirrored in src/lib/booking/status.ts).
create or replace function public.is_valid_transition(
  from_s public.booking_status, to_s public.booking_status)
returns boolean language sql immutable as $$
  select case from_s
    when 'submitted'         then to_s in ('in_review', 'declined', 'cancelled')
    when 'waitlisted'        then to_s in ('submitted', 'declined', 'cancelled')
    when 'in_review'         then to_s in ('info_requested', 'payment_pending', 'declined', 'cancelled')
    when 'info_requested'    then to_s in ('in_review', 'declined', 'cancelled')
    when 'payment_pending'   then to_s in ('payment_submitted', 'expired', 'cancelled')
    when 'payment_submitted' then to_s in ('confirmed', 'payment_pending', 'cancelled')
    when 'confirmed'         then to_s in ('completed', 'cancelled')
    else false   -- completed, declined, expired, cancelled are final
  end
$$;

create table public.booking_status_history (
  id           bigint generated always as identity primary key,
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  from_status  public.booking_status,
  to_status    public.booking_status not null,
  actor_type   public.actor_type not null,
  actor_id     uuid,
  reason       text,
  created_at   timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);

-- Enforce valid moves; record history. Actor comes from transaction-local
-- settings written by public.transition_booking / public.create_booking.
create or replace function public.bookings_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_type public.actor_type := coalesce(nullif(current_setting('app.actor_type', true), ''), 'system')::public.actor_type;
  v_actor_id   uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  v_reason     text := nullif(current_setting('app.reason', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status not in ('submitted', 'waitlisted') then
      raise exception 'A new booking must start as submitted or waitlisted, not %', new.status
        using errcode = 'check_violation';
    end if;
    insert into public.booking_status_history (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (new.id, null, new.status, v_actor_type, v_actor_id, v_reason);
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.is_valid_transition(old.status, new.status) then
      raise exception 'Invalid status change: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    insert into public.booking_status_history (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (new.id, old.status, new.status, v_actor_type, v_actor_id, v_reason);
  end if;
  return new;
end $$;

create trigger bookings_status_guard_ins after insert on public.bookings
  for each row execute function public.bookings_status_guard();
create trigger bookings_status_guard_upd before update of status on public.bookings
  for each row execute function public.bookings_status_guard();

-- Statuses that occupy meetup seats.
create or replace function public.seat_holding(s public.booking_status)
returns boolean language sql immutable as $$
  select s in ('payment_pending', 'payment_submitted', 'confirmed', 'completed')
$$;

-- Seats left for an event (for display; the authoritative check is inside
-- transition_booking, which locks the event row).
create or replace function public.event_seats_left(p_event_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select e.capacity - coalesce((
    select sum(b.party_size) from public.bookings b
    where b.event_id = e.id and public.seat_holding(b.status)), 0)::integer
  from public.events e where e.id = p_event_id
$$;

-- Next booking code, e.g. QT-2610-0042 (month in India time).
create or replace function public.next_booking_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yymm text := to_char(now() at time zone 'Asia/Kolkata', 'YYMM');
  v_n    integer;
begin
  insert into public.booking_code_counters (yymm, last) values (v_yymm, 1)
  on conflict (yymm) do update set last = public.booking_code_counters.last + 1
  returning last into v_n;
  return 'QT-' || v_yymm || '-' || lpad(v_n::text, 4, '0');
end $$;

-- Create a booking atomically (FR-B6, FR-B9). Called by the server only.
-- For fan meetups: locks the event row; if confirmed + held seats already
-- fill the event, the booking is saved as waitlisted.
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

  return query select v_row.id, v_row.booking_code, v_row.status;
end $$;

-- Move a booking to a new status (all status changes go through here).
-- Re-checks meetup capacity when a seat would be taken.
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

-- ---------------------------------------------------------------------
-- Payments (manual in Phase 1)
-- ---------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  method          public.payment_method not null,
  amount_due      numeric(12, 2) not null,
  amount_paid     numeric(12, 2) not null check (amount_paid > 0),
  utr             text not null check (utr ~ '^[A-Za-z0-9]{6,30}$'),
  paid_on         date not null,
  screenshot_path text,
  status          public.payment_status not null default 'submitted',
  verified_by     uuid references auth.users (id),
  verified_at     timestamptz,
  reject_reason   text,
  created_at      timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);
-- A UTR can back only one live payment (FR-P4); a rejected entry frees it.
create unique index payments_utr_unique on public.payments (upper(utr)) where status <> 'rejected';

-- ---------------------------------------------------------------------
-- Files, notes, messages, OTP, settings, audit
-- ---------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  kind          text not null check (kind in ('brief', 'payment_screenshot')),
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes between 1 and 10485760),
  created_at    timestamptz not null default now()
);
create index attachments_booking_idx on public.attachments (booking_id);

create table public.booking_notes (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  author_type  public.actor_type not null,          -- staff note or requester reply
  author_id    uuid references auth.users (id),
  body         text not null check (length(body) between 1 and 5000),
  internal     boolean not null default true,       -- false = visible to requester
  created_at   timestamptz not null default now()
);
create index booking_notes_booking_idx on public.booking_notes (booking_id, created_at);

create table public.message_log (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid references public.bookings (id) on delete set null,
  channel              public.message_channel not null,
  template             text not null,
  recipient            text not null,
  provider_message_id  text,
  status               public.message_status not null default 'queued',
  error                text,
  attempts             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index message_log_booking_idx on public.message_log (booking_id);
create index message_log_provider_idx on public.message_log (provider_message_id);
create trigger message_log_updated before update on public.message_log
  for each row execute function public.set_updated_at();

create table public.otp_codes (
  id           uuid primary key default gen_random_uuid(),
  phone_hash   text not null,
  code_hash    text not null,
  purpose      public.otp_purpose not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  verified_at  timestamptz,
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index otp_codes_phone_idx on public.otp_codes (phone_hash, created_at desc);

create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
create trigger settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id),
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- Row-level security
-- Staff get read access by role; nobody gets direct write access.
-- (The service role used by server routes bypasses RLS.)
-- ---------------------------------------------------------------------
alter table public.staff_profiles          enable row level security;
alter table public.categories              enable row level security;
alter table public.events                  enable row level security;
alter table public.booking_code_counters   enable row level security;
alter table public.bookings                enable row level security;
alter table public.booking_status_history  enable row level security;
alter table public.payments                enable row level security;
alter table public.attachments             enable row level security;
alter table public.booking_notes           enable row level security;
alter table public.message_log             enable row level security;
alter table public.otp_codes               enable row level security;
alter table public.settings                enable row level security;
alter table public.audit_log               enable row level security;

create policy "staff read own profile; super admin reads all" on public.staff_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.current_staff_role() = 'super_admin');

create policy "anyone reads active categories" on public.categories
  for select to anon, authenticated using (active or public.current_staff_role() is not null);

create policy "anyone reads published events; staff read all" on public.events
  for select to anon, authenticated
  using (status = 'published' or public.current_staff_role() is not null);

create policy "staff read bookings by role" on public.bookings
  for select to authenticated using (public.staff_can_see(category));

create policy "staff read history by role" on public.booking_status_history
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.staff_can_see(b.category)));

create policy "admins read payments" on public.payments
  for select to authenticated
  using (public.current_staff_role() in ('super_admin', 'admin', 'client_approver'));

create policy "staff read attachments by role" on public.attachments
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.staff_can_see(b.category)));

create policy "staff read notes by role" on public.booking_notes
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and public.staff_can_see(b.category)));

create policy "staff read messages by role" on public.message_log
  for select to authenticated
  using ((booking_id is null and public.current_staff_role() in ('super_admin', 'admin'))
         or exists (select 1 from public.bookings b where b.id = booking_id and public.staff_can_see(b.category)));

create policy "staff read settings" on public.settings
  for select to authenticated using (public.current_staff_role() is not null);

create policy "super admin reads audit log" on public.audit_log
  for select to authenticated using (public.current_staff_role() = 'super_admin');

-- otp_codes and booking_code_counters: no policies => server only.

-- Database functions that change data are callable by the server only.
revoke all on function public.create_booking(jsonb) from public, anon, authenticated;
revoke all on function public.transition_booking(uuid, public.booking_status, public.actor_type, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.next_booking_code() from public, anon, authenticated;
grant execute on function public.create_booking(jsonb) to service_role;
grant execute on function public.transition_booking(uuid, public.booking_status, public.actor_type, uuid, text, jsonb) to service_role;
grant execute on function public.next_booking_code() to service_role;

-- ---------------------------------------------------------------------
-- Storage: private bucket for briefs and payment screenshots (10 MB max)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-files', 'booking-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Seed data (placeholders — change in the admin Settings screen)
-- ---------------------------------------------------------------------
insert into public.categories (code, name, advance_type, advance_value, hold_hours, min_budget, response_time) values
  ('podcast',    'Podcast / Interview', 'percent',      50, 24,  null, 'Within 3 working days'),
  ('fan_meetup', 'Fan Meetup',          'ticket_price', 100, 2,  null, 'Within 24 hours'),
  ('misc_event', 'Miscellaneous Event', 'percent',      50, 48,  null, 'Within 3 working days');

insert into public.settings (key, value) values
  ('payment_details', jsonb_build_object(
      'upi_id', '', 'upi_qr_path', '', 'account_name', '', 'account_number', '',
      'ifsc', '', 'bank_name', '')),
  ('notifications', jsonb_build_object('whatsapp', false, 'email', true, 'sms', true)),
  ('site', jsonb_build_object(
      'status_line', 'Now accepting podcast, meetup and event requests',
      'consent_version', '2026-10-v1')),
  ('reminders', jsonb_build_object('payment_reminder_at_fraction', 0.5, 'event_reminder_hours', 24));
