# Qazi Touqeer — Official Website

Booking website for podcast, fan meetup and event requests, with an admin
dashboard for the CodeAssure team. Built with Next.js, TypeScript, Tailwind CSS
and Supabase. The Phase 1 spec is the "Qazi Touqeer Website — Phase 1 PRD" doc.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1. Foundation | Project, database schema, security rules, status rules | Done (database tested) |
| 2. Booking engine | OTP, booking creation, forms, Track My Booking | Next |
| 3. Admin | Login, roles, pipeline, actions, settings | — |
| 4. Payments and messages | Manual payment flow, email, SMS, WhatsApp | — |
| 5. Frontend design | Full visual design and content | — |
| 6. QA and launch | Tests, production deploy | — |

## One-time setup

### 1. Supabase

1. Create a project at supabase.com (region: Mumbai).
2. Open **SQL Editor → New query**, paste the whole of
   `supabase/migrations/20261015000000_init.sql` and click **Run**.
   It should finish with "Success. No rows returned".
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

## Project layout

```
src/app/                 pages and API routes
src/lib/supabase/        Supabase clients (browser, server, service role)
src/lib/booking/         booking statuses and rules shared by UI and server
supabase/migrations/     database schema (run in order)
supabase/tests/          database rule tests
```
