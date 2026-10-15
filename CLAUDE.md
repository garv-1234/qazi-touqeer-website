# CLAUDE.md — Qazi Touqeer website

Context for Claude Code. Read this first, then `docs/PRD.md` (the Phase 1 spec).

## What this is

Official website for Qazi Touqeer (Bigg Boss contestant), built by CodeAssure Pvt Ltd.
Fans and organisers request **podcasts/interviews, fan meetups and miscellaneous events**
through online forms; the team screens them in an admin dashboard; requesters pay an
advance by UPI/bank transfer and an admin confirms payment by hand. Goal: no booking calls.

**Phase 1 go-live: 31 October 2026.** Scope is frozen to `docs/PRD.md`. Anything not in it
(Razorpay, AI voice agent, WhatsApp chatbot, auto-expiry, calendar sync, analytics, merch)
belongs to Phase 2/3 — do not build it now.

## Stack

- Next.js 16 (App Router, TypeScript, `src/` dir), Tailwind CSS v4, ESLint flat config
- Supabase: Postgres, Auth (staff only), Storage (private bucket `booking-files`)
- Zod for validation (shared by forms and API routes)
- Hosting: Vercel. Fonts: self-hosted `geist` package (Google Fonts is not used)
- Next 16 note: request middleware lives in `src/proxy.ts` (not `middleware.ts`)

## Working agreements

- **Backend first.** Build and test the booking engine, admin and notifications with a
  basic, clean UI. Full visual design comes in step 5. Look: clean, light, premium.
- **The database is the authority.** Status moves, history, seat locking, one-open-request
  and unique-UTR rules are enforced in Postgres. Never bypass them in app code.
- **All status changes go through `public.transition_booking(...)`**; all booking creation
  through `public.create_booking(jsonb)`. Never `update bookings set status = ...` directly.
- If you change allowed moves, update BOTH `public.is_valid_transition` (new migration)
  and `src/lib/booking/status.ts`, and extend `supabase/tests/db-rules.test.mjs`.
- **Security model:** public visitors never query tables. Public actions = server routes
  using `createAdminClient()` (service role) after their own checks (OTP token, rate limits,
  Zod). Staff reads use `src/lib/supabase/server.ts` (RLS applies). Staff writes go through
  server routes that check `staff_profiles.role` first, then call the DB functions.
- Only `super_admin` and `admin` may mark payments paid. Log every staff action to `audit_log`.
- Never put secrets in code or `NEXT_PUBLIC_*` vars. Service role key is server-only.
- Schema changes = new timestamped file in `supabase/migrations/`; never edit an applied one.
- Times stored in UTC, displayed in IST (Asia/Kolkata). Phones stored as E.164.
- Booking IDs: `QT-YYMM-NNNN` from `public.next_booking_code()`.

## Commands

```bash
npm run dev         # local dev server
npm run test:db     # DB rules on in-memory Postgres (PGlite) — run after any migration change
npm run typecheck
npm run lint
npm run build
```

## Layout

```
docs/PRD.md                          Phase 1 spec (requirement IDs FR-W/B/P/N/A, NFR)
supabase/migrations/*_init.sql       schema, functions, triggers, RLS, seed
supabase/migrations/*_booking_engine.sql  requester-move guard, OTP, submit_payment, reply, events
supabase/tests/db-rules.test.mjs     50 database rule tests (applies every migration in order)
src/lib/supabase/{admin,server,browser}.ts
src/lib/booking/status.ts            statuses + allowed moves + requester moves (mirror of DB)
src/lib/booking/{categories,events}.ts  booking copy, next-step text, IST/₹ formatting (shared)
src/lib/booking/{server,track-route}.ts server-only: lookup by code+phone, upload checks, Track view
src/lib/validation/                  Zod schemas shared by forms and API routes
src/lib/server/{crypto,http}.ts      hashes, OTP token, body parsing, bot check, IP, PG error mapping
src/lib/sms/                         SmsProvider interface (dev console provider only for now)
src/lib/notifications/queue.ts       queues message_log rows ('queued'); step 4 sends them
src/components/booking/              PhoneVerify, BookingFlow, three category forms
src/components/track/                Track My Booking client
src/app/                             pages and API routes
```

## Progress

| Step | Dates | Scope | State |
| --- | --- | --- | --- |
| 1. Foundation | 15–16 Oct | Next.js, schema, RLS, status trigger, seat locking, tests | **Done** |
| 2. Booking engine | 17–19 Oct | OTP send/verify, `/api/bookings`, uploads, 3 basic forms, Track My Booking | **Done** |
| 3. Admin | 20–22 Oct | Staff login, roles, pipeline, request detail, actions, events, settings, audit | **Next** |
| 4. Payments + messages | 23–25 Oct | Manual payment flow, email, SMS OTP, WhatsApp templates, cron reminders | — |
| 5. Frontend design | 26–28 Oct | Home, About, Media, Events, FAQ, legal; full design; real content | — |
| 6. QA + launch | 29–31 Oct | E2E tests, fixes, domain, production keys | — |

### How the booking engine works (step 2)

- **OTP**: `/api/otp/send` → `public.issue_otp` (5 sends/phone/hour, 20/IP/hour, atomic);
  `/api/otp/verify` → `public.check_otp` (5 attempts, single use). Phone and code are HMAC'd
  with `HASH_SALT` before they reach the DB. Success returns a 30-min token
  (`src/lib/server/crypto.ts`) bound to phone + purpose (`submit` or `track`).
  Track sends a code only if the Booking ID belongs to that phone, but answers the same either way.
- **Dev SMS**: with `NODE_ENV=development` the code is logged and returned as `dev_code`.
  Elsewhere `getSmsProvider()` returns null → 503 until step 4 adds a real provider.
- **Bot check**: honeypot `website` + `started_at` time trap (`failsBotCheck`). No captcha yet.
- **Requester moves** are enforced in `transition_booking` (actor `requester` may only reply,
  submit UTR, or cancel before payment; its patch is ignored). Mirror: `REQUESTER_TRANSITIONS`.
- **Uploads** go to `<kind>/<hash of phone>/<uuid>.<ext>`; the server re-checks owner folder,
  size and type with `storage.info()` before saving the attachment row.
- **Info requests**: Track shows the latest `booking_notes` row with `author_type='staff'`
  and `internal=false` as the question, so step 3's "request info" action must write that note.
- **Messages**: `queueMessages()` writes `message_log` rows with status `queued`
  (requester: email + WhatsApp, or SMS while WhatsApp is off; team: email to staff by role).
  Nothing sends them yet. That's step 4, along with the template text.
- Legal pages linked from the consent boxes (`/terms`, `/privacy`, `/refund-policy`) are step 5.

## Open questions (from the client)

- Advance rules, hold windows, minimum budgets per category (seed values are placeholders)
- UPI ID / QR / bank account for advances
- WhatsApp Business documents + sender number; SMS/OTP provider (MSG91 suggested)
- Fan meetup format (paid / free / both); who the client approver is and the approval threshold
- Domain, and who owns the Vercel and Supabase accounts
- Final content: bio, photos, videos, policies, FAQ
