# Qazi Touqeer — Official Website

Booking website for podcast, fan meetup and event requests, with an admin
dashboard for the CodeAssure team. Built with Next.js, TypeScript, Tailwind CSS
and Supabase. The Phase 1 spec is the "Qazi Touqeer Website — Phase 1 PRD" doc.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1. Foundation | Project, database schema, security rules, status rules | Done (database tested) |
| 2. Booking engine | OTP, booking creation, forms, Track My Booking | Done (needs SMS provider in step 4) |
| 3. Admin | Login, roles, pipeline, actions, settings | Next |
| 4. Payments and messages | Manual payment flow, email, SMS, WhatsApp | — |
| 5. Frontend design | Full visual design and content | — |
| 6. QA and launch | Tests, production deploy | — |

## One-time setup

### 1. Supabase

1. Create a project at supabase.com (region: Mumbai).
2. Open **SQL Editor → New query** and run each file in `supabase/migrations/`
   in name order (paste the whole file, click **Run**), one query per file:
   `20261015000000_init.sql`, `20261017000000_booking_engine.sql`,
   `20261018000000_meetup_cutoff.sql`, then `20261019000000_admin_core.sql`.
   Each should finish with "Success. No rows returned".
3. Create the first staff login: **Authentication → Users → Add user**
   (email + password, tick "Auto confirm"). Copy the new user's ID, then run:

   ```sql
   insert into public.staff_profiles (user_id, full_name, email, role)
   values ('PASTE-USER-ID', 'Your Name', 'you@codeassure.in', 'super_admin');
   ```

### 2. Local development

```bash
cp .env.example .env.local   # fill in the Supabase URL and keys
npm install
npm run dev                  # http://localhost:3000
```

In development there is no SMS: the OTP code appears on screen and in the server console.
To test on a phone, open the "Network" URL that `npm run dev` prints (same Wi-Fi). Private
LAN addresses (192.168.x.x, 10.x.x.x) are allowed in `next.config.ts`; add any other host,
such as a tunnel, to `DEV_ALLOWED_ORIGINS` in `.env.local` (comma-separated).
To try a fan meetup, insert a row into `public.events` with `status = 'published'`
and a future `starts_at` (the admin screen for events comes in step 3).

### 3. Checks

```bash
npm run test:db     # database rules against an in-memory Postgres (no Supabase needed)
npm run typecheck
npm run lint
npm run build
```

## Database rules (enforced in Postgres, not only in code)

- Every table has row-level security. Visitors never query tables directly;
  public actions go through server routes using the service role.
- Status moves are checked by a trigger; every move is written to
  `booking_status_history` with who made it.
- Meetup seats are counted under a row lock, so the last seat can't be sold twice.
- One open request per phone number per category.
- A payment reference (UTR) can back only one live payment.
- Requesters can only reply to an info request, submit a UTR, or cancel before paying.
- OTP send limits (5 per phone, 20 per IP, per hour) and 5 attempts per code.

## Project layout

```
src/app/                 pages and API routes
src/lib/supabase/        Supabase clients (browser, server, service role)
src/lib/booking/         booking statuses, rules and copy; server helpers for Track
src/lib/validation/      Zod schemas shared by forms and API routes
src/lib/server/          hashing, OTP token, request helpers (server only)
src/components/          booking forms, Track My Booking, basic UI
supabase/migrations/     database schema (run in order)
supabase/tests/          database rule tests
```
