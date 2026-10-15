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
supabase/tests/db-rules.test.mjs     26 database rule tests
src/lib/supabase/{admin,server,browser}.ts
src/lib/booking/status.ts            statuses + allowed moves (mirror of DB)
src/app/                             pages and API routes
```

## Progress

| Step | Dates | Scope | State |
| --- | --- | --- | --- |
| 1. Foundation | 15–16 Oct | Next.js, schema, RLS, status trigger, seat locking, tests | **Done** |
| 2. Booking engine | 17–19 Oct | OTP send/verify, `/api/bookings`, uploads, 3 basic forms, Track My Booking | **Next** |
| 3. Admin | 20–22 Oct | Staff login, roles, pipeline, request detail, actions, events, settings, audit | — |
| 4. Payments + messages | 23–25 Oct | Manual payment flow, email, SMS OTP, WhatsApp templates, cron reminders | — |
| 5. Frontend design | 26–28 Oct | Home, About, Media, Events, FAQ, legal; full design; real content | — |
| 6. QA + launch | 29–31 Oct | E2E tests, fixes, domain, production keys | — |

### Step 2 plan (start here)

1. `src/lib/validation/` — Zod schemas: common block (FR-B1) + one per category (FR-B2..B4).
2. OTP: `/api/otp/send`, `/api/otp/verify` using `otp_codes` (hash phone + code with
   `HASH_SALT`; 6 digits, 10 min expiry, 5 attempts, 5 sends/phone/hour). On success return a
   short-lived signed token (HMAC with `OTP_TOKEN_SECRET`) bound to the phone + purpose.
   SMS provider not chosen yet → implement an `SmsProvider` interface with a `console`/dev
   provider that shows the code in development only.
3. `/api/bookings` — verify OTP token, validate, rate-limit by IP, call `create_booking`,
   map the unique-violation on `bookings_one_open_per_phone_category` to "you already have
   an open request" + existing Booking ID. Queue acknowledgements (step 4 sends them).
4. `/api/uploads` — signed upload URLs to `booking-files` (PDF/JPEG/PNG/WEBP, ≤10 MB).
5. Basic pages: `/book`, `/book/podcast`, `/book/fan-meetup`, `/book/event`, `/track`.
6. `/api/events` and `/api/track*` (status, payment details, UTR submit, cancel).

## Open questions (from the client)

- Advance rules, hold windows, minimum budgets per category (seed values are placeholders)
- UPI ID / QR / bank account for advances
- WhatsApp Business documents + sender number; SMS/OTP provider (MSG91 suggested)
- Fan meetup format (paid / free / both); who the client approver is and the approval threshold
- Domain, and who owns the Vercel and Supabase accounts
- Final content: bio, photos, videos, policies, FAQ
