// Runs the migration against an in-memory Postgres (PGlite) with a minimal
// Supabase stub, then checks the database rules.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const migration = fs.readFileSync(process.argv[2], 'utf8');
const db = new PGlite();

const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };
const throws = async (name, fn, match) => {
  try { await fn(); ok(name + ' (expected error, got none)', false); }
  catch (e) { ok(name, !match || String(e.message).includes(match)); if (match && !String(e.message).includes(match)) console.log('      got:', e.message); }
};

await db.exec(stub);
await db.exec(migration);
ok('migration applied', true);

const base = (o) => JSON.stringify({
  name: 'Test Person', phone: '+919800000001', phone_verified_at: new Date().toISOString(),
  email: 't@example.com', city: 'Delhi', consent_version: '2026-10-v1', details: {}, ...o });
const create = async (o) => (await db.query(`select * from public.create_booking($1::jsonb)`, [base(o)])).rows[0];
const move = (id, to, patch = {}) => db.query(
  `select status from public.transition_booking($1, $2::public.booking_status, 'staff', null, 'test', $3::jsonb)`,
  [id, to, JSON.stringify(patch)]);

// 1. create + code + history
const a = await create({ category: 'podcast' });
ok('podcast booking created as submitted', a.status === 'submitted');
ok('booking code format QT-YYMM-0001', /^QT-\d{4}-0001$/.test(a.booking_code));
const h = await db.query(`select * from public.booking_status_history where booking_id = $1`, [a.id]);
ok('history row written on insert', h.rows.length === 1 && h.rows[0].actor_type === 'requester');

// 2. duplicate guard
await throws('second open podcast request from same phone refused', () => create({ category: 'podcast' }), 'bookings_one_open_per_phone_category');
const b = await create({ category: 'misc_event', budget: '50000' });
ok('same phone, different category allowed; code increments', b.booking_code.endsWith('-0002'));

// 3. transitions
await throws('submitted -> confirmed refused', () => move(a.id, 'confirmed'), 'Invalid status change');
await move(a.id, 'in_review');
await move(a.id, 'payment_pending', { advance_amount: 5000, payment_deadline: new Date(Date.now() + 864e5).toISOString() });
const ar = (await db.query(`select status, advance_amount from public.bookings where id=$1`, [a.id])).rows[0];
ok('approve sets payment_pending and advance', ar.status === 'payment_pending' && Number(ar.advance_amount) === 5000);
const h2 = await db.query(`select to_status from public.booking_status_history where booking_id=$1 order by id`, [a.id]);
ok('history has 3 rows', h2.rows.map(r => r.to_status).join(',') === 'submitted,in_review,payment_pending');
await throws('direct update to an invalid status refused by trigger', () => db.query(`update public.bookings set status='completed' where id=$1`, [a.id]), 'Invalid status change');

// 4. meetup capacity
const ev = (await db.query(`insert into public.events (title, city, venue, starts_at, capacity, ticket_price, status)
  values ('Delhi meetup','Delhi','Hall A', now() + interval '10 days', 2, 999, 'published') returning id`)).rows[0].id;
const m1 = await create({ category: 'fan_meetup', event_id: ev, party_size: 2, phone: '+919800000011' });
const m2 = await create({ category: 'fan_meetup', event_id: ev, party_size: 1, phone: '+919800000012' });
ok('meetup requests submitted while no seats are held', m1.status === 'submitted' && m2.status === 'submitted');
await move(m1.id, 'in_review'); await move(m1.id, 'payment_pending');
const left = (await db.query(`select public.event_seats_left($1) n`, [ev])).rows[0].n;
ok('seats left = 0 after approving party of 2', left === 0);
await move(m2.id, 'in_review');
await throws('approving beyond capacity refused', () => move(m2.id, 'payment_pending'), 'No seats left');
const m3 = await create({ category: 'fan_meetup', event_id: ev, party_size: 1, phone: '+919800000013' });
ok('new meetup request is waitlisted when full', m3.status === 'waitlisted');
await move(m1.id, 'expired');
ok('expiring frees seats', (await db.query(`select public.event_seats_left($1) n`, [ev])).rows[0].n === 2);
await move(m3.id, 'submitted');
ok('waitlisted -> submitted clears waitlist flag', (await db.query(`select is_waitlist from public.bookings where id=$1`, [m3.id])).rows[0].is_waitlist === false);
await throws('closed or unknown event refused', () => create({ category: 'fan_meetup', event_id: '00000000-0000-0000-0000-000000000000', phone: '+919800000014' }), 'not open for booking');

// 5. UTR uniqueness
await db.query(`insert into public.payments (booking_id, method, amount_due, amount_paid, utr, paid_on) values ($1,'upi',5000,5000,'412345678901',current_date)`, [a.id]);
await throws('reused UTR refused', () => db.query(`insert into public.payments (booking_id, method, amount_due, amount_paid, utr, paid_on) values ($1,'upi',1,1,'412345678901',current_date)`, [b.id]), 'payments_utr_unique');
await db.query(`update public.payments set status='rejected' where utr='412345678901'`);
await db.query(`insert into public.payments (booking_id, method, amount_due, amount_paid, utr, paid_on) values ($1,'upi',1,1,'412345678901',current_date)`, [b.id]);
ok('UTR reusable after the first entry is rejected', true);

// 6. RLS
const mgr = '11111111-1111-1111-1111-111111111111', adm = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users values ($1),($2)`, [mgr, adm]);
await db.query(`insert into public.staff_profiles (user_id, full_name, email, role, categories) values
  ($1,'Fan Coord','f@x.com','category_manager','{fan_meetup}'), ($2,'Admin','a@x.com','admin','{}')`, [mgr, adm]);
const as = async (role, uid, sql) => {
  await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', true);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('rollback'); }
};
ok('anonymous visitor sees no bookings', (await as('anon', null, 'select * from public.bookings')).length === 0);
const mgrRows = await as('authenticated', mgr, 'select category from public.bookings');
ok('category manager sees only fan meetups', mgrRows.length === 3 && mgrRows.every(r => r.category === 'fan_meetup'));
ok('admin sees all bookings', (await as('authenticated', adm, 'select * from public.bookings')).length === 5);
ok('category manager cannot read payments', (await as('authenticated', mgr, 'select * from public.payments')).length === 0);
await throws('staff cannot update bookings directly', async () => {
  const r = await as('authenticated', adm, `update public.bookings set city='X' returning id`);
  if (r.length === 0) throw new Error('no rows updated');
}, 'no rows updated');
await throws('anon cannot call create_booking', () => as('anon', null, `select public.create_booking('{}'::jsonb)`), 'permission denied');
ok('anon sees published events only', (await as('anon', null, 'select * from public.events')).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
