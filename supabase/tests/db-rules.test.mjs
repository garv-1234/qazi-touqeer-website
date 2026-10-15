// Runs every migration (in file-name order) against an in-memory Postgres
// (PGlite) with a minimal Supabase stub, then checks the database rules.
// Usage: node db-rules.test.mjs <migrations dir | single migration file>
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
const files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(target, f))
  : [target];
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
for (const f of files) await db.exec(fs.readFileSync(f, 'utf8'));
ok(`${files.length} migration(s) applied`, true);

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

// 7. requester-only moves (step 2)
const asRequester = (id, to, reason = 'test') => db.query(
  `select status from public.transition_booking($1, $2::public.booking_status, 'requester', null, $3)`, [id, to, reason]);
const c = await create({ category: 'podcast', phone: '+919800000021' });
await throws('requester cannot start a review', () => asRequester(c.id, 'in_review'), 'Requester cannot');
await asRequester(c.id, 'cancelled');
const ch = (await db.query(`select actor_type from public.booking_status_history where booking_id=$1 and to_status='cancelled'`, [c.id])).rows[0];
ok('requester can cancel before payment; history says requester', ch?.actor_type === 'requester');
const d0 = await create({ category: 'podcast', phone: '+919800000023' });
await db.query(`select public.transition_booking($1, 'cancelled', 'requester', null, 'x', '{"advance_amount": 1}'::jsonb)`, [d0.id]);
ok('requester cannot set staff fields (patch ignored)',
  (await db.query(`select advance_amount from public.bookings where id=$1`, [d0.id])).rows[0].advance_amount === null);

// 8. attachments saved with the booking
const e1 = await create({ category: 'misc_event', phone: '+919800000024', budget: '100000',
  attachments: [{ kind: 'brief', storage_path: 'brief/abc/x.pdf', mime_type: 'application/pdf', size_bytes: 1234 }] });
ok('create_booking saves attachments', (await db.query(`select count(*)::int n from public.attachments where booking_id=$1`, [e1.id])).rows[0].n === 1);

// 9. OTP issue / check
const issue = async (phone, code, ip = 'ip-1', ttl = 600) =>
  (await db.query(`select public.issue_otp($1, 'submit', $2, $3, $4) r`, [phone, code, ip, ttl])).rows[0].r;
const check = async (phone, code) =>
  (await db.query(`select * from public.check_otp($1, 'submit', $2)`, [phone, code])).rows[0];
ok('OTP issued', await issue('ph-1', 'code-1') === 'ok');
const w = await check('ph-1', 'wrong');
ok('wrong OTP counts an attempt', w.result === 'invalid' && w.attempts_left === 4);
ok('right OTP verifies', (await check('ph-1', 'code-1')).result === 'ok');
ok('verified OTP cannot be reused', (await check('ph-1', 'code-1')).result === 'none');
for (let i = 0; i < 3; i++) await issue('ph-1', 'code-x');
ok('5th send in an hour allowed', await issue('ph-1', 'code-5') === 'ok');
ok('6th send in an hour refused', await issue('ph-1', 'code-6') === 'phone_limit');
await issue('ph-2', 'code-2');
for (let i = 0; i < 4; i++) await check('ph-2', 'wrong');
ok('5th wrong attempt locks the code', (await check('ph-2', 'wrong')).result === 'too_many');
ok('locked code refuses even the right code', (await check('ph-2', 'code-2')).result === 'too_many');
await issue('ph-3', 'code-3', 'ip-1', 0);
ok('expired OTP refused', (await check('ph-3', 'code-3')).result === 'expired');
for (let p = 0; p < 4; p++) for (let i = 0; i < 5; i++) if (await issue(`ip-ph-${p}`, 'c', 'ip-9') !== 'ok') ok('setup ip sends', false);
ok('21st send from one IP in an hour refused', await issue('ip-ph-9', 'c', 'ip-9') === 'ip_limit');

// 10. submit_payment
const pay = (id, utr, shot = null) => db.query(
  `select * from public.submit_payment($1, 'upi', 5000, $2, current_date, $3::jsonb)`, [id, utr, shot && JSON.stringify(shot)]);
await throws('submit_payment refuses a UTR already in use', () => pay(a.id, '412345678901'), 'payments_utr_unique');
ok('failed UTR leaves booking in payment_pending', (await db.query(`select status from public.bookings where id=$1`, [a.id])).rows[0].status === 'payment_pending');
await pay(a.id, '512345678901', { storage_path: 'payment_screenshot/abc/s.png', mime_type: 'image/png', size_bytes: 99 });
const ap = (await db.query(`select b.status, p.amount_due, (select count(*)::int from public.attachments t where t.booking_id=b.id) n
  from public.bookings b join public.payments p on p.booking_id=b.id and p.utr='512345678901' where b.id=$1`, [a.id])).rows[0];
ok('UTR moves booking to payment_submitted with amount due and screenshot', ap.status === 'payment_submitted' && Number(ap.amount_due) === 5000 && ap.n === 1);
await throws('second UTR on a payment_submitted booking refused', () => pay(a.id, '612345678901'), 'not waiting for a payment');
await throws('requester cannot cancel after paying', () => asRequester(a.id, 'cancelled'), 'Requester cannot');

// 11. requester_reply
const d = await create({ category: 'podcast', phone: '+919800000022' });
await throws('reply refused when no info was requested', () => db.query(`select public.requester_reply($1, 'hi')`, [d.id]), 'not waiting for a reply');
await move(d.id, 'in_review'); await move(d.id, 'info_requested');
await db.query(`select public.requester_reply($1, 'Here are the links')`, [d.id]);
const dr = (await db.query(`select b.status, n.internal, n.author_type from public.bookings b join public.booking_notes n on n.booking_id=b.id where b.id=$1`, [d.id])).rows[0];
ok('reply saves a visible note and returns to in_review', dr.status === 'in_review' && dr.internal === false && dr.author_type === 'requester');

// 12. published_events and grants
await db.query(`insert into public.events (title, city, venue, starts_at, capacity, status) values ('Draft','Pune','X', now() + interval '5 days', 10, 'draft')`);
const pe = (await db.query(`select * from public.published_events()`)).rows;
ok('published_events lists only published future events with seats left', pe.length === 1 && pe[0].seats_left === 2);

// 13. meetup cut-off: no requests within 24 hours of the start (booking forms spec)
const soon = (await db.query(`insert into public.events (title, city, venue, starts_at, capacity, status)
  values ('Soon','Pune','Y', now() + interval '20 hours', 10, 'published') returning id`)).rows[0].id;
await throws('meetup starting in under 24 hours refused', () => create({ category: 'fan_meetup', event_id: soon, phone: '+919800000031' }), 'not open for booking');
const pe2 = (await db.query(`select id, bookings_open from public.published_events()`)).rows;
ok('published_events marks under-24h meetups as closed and others open',
  pe2.find((r) => r.id === soon)?.bookings_open === false && pe2.find((r) => r.id === ev)?.bookings_open === true);

await throws('anon cannot call issue_otp', () => as('anon', null, `select public.issue_otp('a', 'submit', 'b')`), 'permission denied');
await throws('anon cannot call submit_payment', () => as('anon', null, `select public.submit_payment(gen_random_uuid(), 'upi', 1, 'X12345', current_date)`), 'permission denied');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
