# Qazi Touqeer Website — Phase 1 PRD

Oct 15, 2026 · CodeAssure Pvt Ltd

## Purpose, scope and decisions

Phase 1 ships a working booking website for Qazi Touqeer by 31 October 2026: fans and organisers submit requests online, the CodeAssure team screens and approves them in an admin dashboard, requesters pay the advance by UPI or bank transfer, and an admin confirms the payment by hand. No booking calls.

This PRD is the build spec for Phase 1 only. The full vision is in the Website and Booking System Blueprint; anything not listed here waits for Phase 2 or 3.

| Decision | Phase 1 choice |
| --- | --- |
| Booking categories | Three: Podcast / Interview, Fan Meetup, Miscellaneous Event |
| Payments | No gateway. Requester pays by UPI or bank transfer, enters the UTR, admin marks paid after checking the account. Razorpay comes in Phase 2 |
| Notifications | WhatsApp Business API, email, and phone OTP at form submission |
| Stack | Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres, Auth, Storage), hosted on Vercel |
| Visual direction | Clean, light, premium; brand assets swapped in when received |
| Build order | Backend first (database, rules, booking workflow, admin, notifications) with a basic but clean frontend; frontend polish once the backend is stable |
| Languages | English at launch; Hindi pages added as copy arrives |

## Users and roles

There are two kinds of users: public users, who never log in, and staff, who log in to the admin dashboard with email and password. A staff member's role decides what they can see and do, and the database enforces it.

| Role | Who | Can do | Cannot do |
| --- | --- | --- | --- |
| Visitor | Anyone on the site | Browse pages, view the events calendar, start a form | See any booking data |
| Requester | Anyone who has submitted a form | Track their booking with Booking ID + phone OTP, submit payment UTR, cancel before payment | See other requesters' data |
| Super admin | CodeAssure lead | Everything, including managing staff, settings, payment details and deleting data | — |
| Admin | Booking coordinators | Review, approve, decline and request info on all categories; mark payments; release slots; manage events and slots | Manage staff or settings |
| Category manager | Fan coordinator or partnerships manager | The same actions as Admin, limited to their assigned categories | See other categories, mark payments |
| Client approver | Qazi or his manager | View all requests, approve or decline requests flagged for client sign-off, view the confirmed calendar | Edit requests, mark payments, see staff settings |

Rule: only Super admin and Admin can mark a payment as received, so money is always confirmed by a senior staff member, and every Mark paid is logged with who did it.

## Public website (FR-W)

Every page works on a 360 px wide phone, loads fast on 4G and shows a sticky Book button. Page copy and images come from a content file the team can edit without touching code.

| ID | Page | Requirement |
| --- | --- | --- |
| FR-W1 | Home | Hero with photo or video, a status line set from settings, three booking tiles, upcoming events, latest content, short FAQ, footer saying bookings happen only on this site |
| FR-W2 | About / Journey | Bio, milestone timeline, photo gallery |
| FR-W3 | Book Qazi | Three category cards, each with what to expect, starting price or "on request" and expected response time, linking to its form |
| FR-W4 | Booking forms | One page per category (see FR-B) |
| FR-W5 | Events Calendar | Published fan meetups with date, city, venue, price and live seats-left; full events show "Join waitlist" |
| FR-W6 | Media | Embedded Instagram and YouTube content, press mentions |
| FR-W7 | Track My Booking | Booking ID + phone OTP shows status, next step, payment details and deadline when payment is pending, a UTR form, and a cancel button before payment |
| FR-W8 | FAQ | Accordion of common questions, editable from content |
| FR-W9 | Legal | Terms, Privacy, Refund and Cancellation, Meetup rules |
| FR-W10 | Errors | Friendly 404 and error pages that point back to Book Qazi |

## Booking forms and requests (FR-B)

Each category has its own multi-step form sharing one common block; the backend validates everything again, never trusting the browser.

| ID | Requirement |
| --- | --- |
| FR-B1 | Common fields: full name, WhatsApp number (Indian +91 by default, others allowed), email, city, preferred date and backup date, how they heard of Qazi, consent to terms, privacy, refund policy and WhatsApp messages |
| FR-B2 | Podcast / Interview fields: channel or show name, channel links, audience size range, topic and sample questions, format (studio, remote, live), duration, language, fee offered or barter |
| FR-B3 | Fan Meetup fields: choose a published meetup event, number of people (1–2), age 18+ confirmation or guardian name, message for Qazi |
| FR-B4 | Miscellaneous Event fields: organiser or company name, GSTIN (optional), event type (show, college fest, opening, brand collab, other), event name, venue and city, date and duration, expected audience, role expected, travel and stay arrangements, budget, brief upload (PDF or image, max 10 MB) |
| FR-B5 | Phone OTP verifies the WhatsApp number before the request is saved |
| FR-B6 | On submit, the system creates a Booking ID (format QT-YYMM-XXXX, e.g. QT-2610-0042), saves the request as Submitted, and sends acknowledgements (FR-N) |
| FR-B7 | Duplicate guard: one open request per phone number per category; a second attempt shows the existing Booking ID |
| FR-B8 | Rate limit: at most 5 OTP sends per phone per hour and 10 submissions per IP per hour; bot check on every form |
| FR-B9 | Fan Meetup capacity: when confirmed plus held seats reach capacity, the form shows "Join waitlist" and the request is saved with a waitlist flag |
| FR-B10 | Below-minimum budgets (set per category in settings) still save, but are tagged for a quick decline with a suggested alternative |
| FR-B11 | Requester can cancel from Track My Booking before payment; after payment, cancellation goes to an admin under the refund policy |

## Manual payment flow (FR-P)

In Phase 1 an admin confirms every payment by checking the bank or UPI account; the code is structured so Razorpay can replace this step in Phase 2 without changing the booking statuses.

| ID | Requirement |
| --- | --- |
| FR-P1 | On approval, the admin sets the advance amount (defaulted from category settings: e.g. full ticket price for meetups, a percentage of the agreed fee for others) and the payment deadline (defaulted from hold-window settings) |
| FR-P2 | The requester receives the amount, UPI ID, UPI QR code, bank account details, the Booking ID to use as payment reference, and the deadline, on WhatsApp, email and Track My Booking |
| FR-P3 | The requester submits the UTR (12-digit UPI or bank reference), amount paid and payment date, with an optional screenshot; the booking moves to Payment submitted |
| FR-P4 | The same UTR can't be used on two bookings |
| FR-P5 | Admin or Super admin verifies in the bank or UPI account and clicks Mark paid (booking becomes Confirmed) or Reject payment with a reason (booking returns to Payment pending and the requester is told) |
| FR-P6 | After the deadline, unpaid bookings show as Overdue; an admin can release the slot (Expired) or extend the deadline once |
| FR-P7 | Every payment action records who did it, when, the amount and the UTR |
| FR-P8 | Payment details (UPI ID, QR image, bank account) are set by the Super admin in settings, never hard-coded |

## Notifications and OTP (FR-N)

Every status change triggers the same message on WhatsApp and email, from approved templates. If WhatsApp isn't approved by launch, email and SMS carry the messages and WhatsApp switches on by a setting.

| ID | Event | Requester gets | Team gets |
| --- | --- | --- | --- |
| FR-N1 | Submitted | Booking ID, summary, what happens next, Track link | New-request alert to the category owner |
| FR-N2 | Info requested | The admin's question and a link to reply | — |
| FR-N3 | Approved, payment pending | Amount, UPI and bank details, reference, deadline | — |
| FR-N4 | Payment reminder | Reminder halfway to the deadline (scheduled job) | — |
| FR-N5 | Payment submitted | "We're checking your payment" | Alert to admins to verify |
| FR-N6 | Confirmed | Confirmation with date, time, venue or meeting details | Alert to client approver |
| FR-N7 | Payment rejected | Reason and how to fix it | — |
| FR-N8 | Declined | Polite decline, alternative if any | — |
| FR-N9 | Expired | Slot released, link to book again | — |
| FR-N10 | Cancelled | Cancellation confirmation and refund terms | Alert to admins |
| FR-N11 | Event reminder | 24 hours before, with venue, time and rules | — |

OTP: 6 digits, valid for 10 minutes, at most 5 attempts, sent by SMS (WhatsApp OTP once approved). Every message sent is logged with its provider message ID and delivery status.

## Admin dashboard (FR-A)

The dashboard lives at /admin, behind staff login, and is usable on a phone so coordinators can act away from a desk.

| ID | Module | Requirement |
| --- | --- | --- |
| FR-A1 | Login | Email and password via Supabase Auth; staff are invited by the Super admin; no public sign-up; sessions expire after 12 hours |
| FR-A2 | Pipeline | Board and list views by status; filters for category, owner, date and Overdue; counts per column; search by Booking ID, name or phone |
| FR-A3 | Request detail | All form answers, attachments, OTP-verified badge, notes, full status history, messages sent, payment record |
| FR-A4 | Actions | Assign owner, start review, request info, approve (with amount and deadline), decline (with reason and template), mark paid, reject payment, extend deadline, release slot, mark completed, cancel; each asks for confirmation and is logged |
| FR-A5 | Client sign-off | Requests can be flagged "needs client approval"; the client approver sees them in a short list and approves or declines in one tap |
| FR-A6 | Events and slots | Create, edit and publish fan meetup events (city, venue, date, time, capacity, price); block dates; see seats held, confirmed and waitlisted |
| FR-A7 | Waitlist | When a slot frees up, the admin sees the waitlist in order and offers the slot to the next person with one click |
| FR-A8 | Settings (Super admin) | Payment details and QR, advance rules and hold windows per category, minimum budgets, notification channels on/off, site status line, staff and roles |
| FR-A9 | Audit log | Every staff action with who, what, when and before/after values; read-only |
| FR-A10 | Export | Bookings to CSV, filtered |

## Booking status rules

A booking is always in exactly one status, and the database refuses any move not shown here.

Allowed moves (source of truth: `public.is_valid_transition` in the migration; mirrored in `src/lib/booking/status.ts`):

| From | To |
| --- | --- |
| Submitted | In review, Declined, Cancelled |
| Waitlisted | Submitted (seat freed), Declined, Cancelled |
| In review | Info requested, Payment pending (approve), Declined, Cancelled |
| Info requested | In review (requester replies), Declined, Cancelled |
| Payment pending | Payment submitted (UTR sent), Expired (released), Cancelled |
| Payment submitted | Confirmed (mark paid), Payment pending (payment rejected), Cancelled |
| Confirmed | Completed, Cancelled |
| Completed, Declined, Expired, Cancelled | — (final) |

Staff make every move except four: the form creates Submitted or Waitlisted, the requester's reply moves Info requested back to In review, the requester's UTR moves Pay pending to Pay submitted, and the requester can cancel before paying. A rejected payment returns the booking to Pay pending with the reason.

## Data model

Thirteen Supabase Postgres tables (twelve listed below plus `booking_code_counters`), all with row-level security switched on. Public users never read tables directly; every public action goes through a server route that uses the service key and checks its own rules.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `staff_profiles` | Staff linked to Supabase Auth users | user\_id, full\_name, role (super\_admin, admin, category\_manager, client\_approver), categories\[\], active |
| `categories` | The three booking types and their rules | code (podcast, fan\_meetup, misc\_event), name, advance\_type (percent, fixed, ticket\_price), advance\_value, hold\_hours, min\_budget, active |
| `events` | Published fan meetups | id, title, city, venue, starts\_at, capacity, ticket\_price, status (draft, published, closed) |
| `bookings` | One row per request | id, booking\_code (unique), category, status, name, phone (E.164), phone\_verified\_at, email, city, preferred\_date, backup\_date, details (JSON, category fields), event\_id, party\_size, is\_waitlist, budget, needs\_client\_approval, below\_minimum, owner\_id, advance\_amount, payment\_deadline, consent\_version, consent\_at, created\_at |
| `booking_status_history` | Every status change | booking\_id, from\_status, to\_status, actor\_type (staff, requester, system), actor\_id, reason, created\_at |
| `payments` | Payment submissions and checks | booking\_id, method (upi, bank; razorpay later), amount\_due, amount\_paid, utr (unique), paid\_on, screenshot\_path, status (submitted, verified, rejected), verified\_by, verified\_at, reject\_reason |
| `attachments` | Briefs and payment screenshots | booking\_id, kind, storage\_path, mime\_type, size\_bytes |
| `booking_notes` | Internal staff notes | booking\_id, author\_id, body, created\_at |
| `message_log` | Every WhatsApp, email and SMS sent | booking\_id, channel, template, recipient, provider\_message\_id, status, error, created\_at |
| `otp_codes` | Phone verification | phone\_hash, code\_hash, purpose (submit, track), expires\_at, attempts, verified\_at |
| `settings` | Editable configuration | key, value (JSON), updated\_by, updated\_at |
| `audit_log` | Staff actions | actor\_id, action, entity, entity\_id, before, after, created\_at |

Two rules live in the database itself, not only in code:

- **No overbooking.** Seats are taken inside a database function that locks the event row, so two people can't grab the last seat at the same moment.
- **Valid status moves only.** A trigger rejects any status change not allowed by the booking status rules and writes the history row automatically.

## Backend API

Next.js route handlers under /api; every input is validated with a shared schema (Zod) used by both the form and the server.

| Route | Method | Who | Does |
| --- | --- | --- | --- |
| `/api/otp/send` | POST | Public | Sends an OTP to a phone for submit or track; rate limited |
| `/api/otp/verify` | POST | Public | Checks the code; returns a short-lived signed token for that phone |
| `/api/bookings` | POST | Public + OTP token | Validates and creates a booking, takes a seat or waitlist place, sends acknowledgements |
| `/api/uploads` | POST | Public + OTP token | Returns a signed upload URL for a brief or payment screenshot (type and size checked) |
| `/api/track` | POST | Public + OTP token | Returns status, next step and payment details for a Booking ID that matches the phone |
| `/api/track/payment` | POST | Public + OTP token | Submits UTR, amount and date for a Payment pending booking |
| `/api/track/cancel` | POST | Public + OTP token | Cancels before payment |
| `/api/events` | GET | Public | Published meetups with seats left |
| `/api/admin/bookings` | GET | Staff | Pipeline list with filters, limited by role |
| `/api/admin/bookings/[id]` | GET | Staff | Request detail, history, payments, messages |
| `/api/admin/bookings/[id]/action` | POST | Staff (by role) | One endpoint per action type: assign, review, request\_info, approve, decline, mark\_paid, reject\_payment, extend, release, complete, cancel, client\_approve |
| `/api/admin/events` | GET, POST, PATCH | Admin+ | Manage meetup events |
| `/api/admin/settings` | GET, PATCH | Super admin | Manage settings and staff |
| `/api/webhooks/whatsapp` | POST | Provider (signed) | Delivery status updates into the message log |
| `/api/cron/reminders` | GET | Scheduler (secret) | Every 15 minutes: payment reminders, Overdue marking, event reminders |

## Security, privacy and non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-1 | Access | Row-level security on every table; staff see only what their role and categories allow; the service key is used only on the server |
| NFR-2 | Secrets | All keys in environment variables on Vercel; nothing secret in the code or the browser |
| NFR-3 | Abuse | Bot check on forms, rate limits on OTP and submissions, file type and size checks on uploads |
| NFR-4 | Privacy | Collect only listed fields; record consent version and time; phone numbers masked in lists for Category managers; requester data deleted 12 months after the booking closes; compliant with India's Digital Personal Data Protection Act, 2023 |
| NFR-5 | Files | Uploads in a private storage bucket, served to staff through short-lived signed links |
| NFR-6 | Performance | Public pages load in under 2.5 seconds on a mid-range phone over 4G; forms stay usable on slow connections |
| NFR-7 | Reliability | A failed WhatsApp or email send never blocks a booking; it is logged and retried |
| NFR-8 | Accessibility | Labels on every field, keyboard navigation, sufficient colour contrast |
| NFR-9 | Monitoring | Error tracking on server and browser; daily database backups |
| NFR-10 | Time | All times stored in UTC, shown in India time (IST) |

## Build order and acceptance criteria

Backend first: the booking engine, admin and notifications are built and tested on simple, clean pages, then the frontend gets its full design pass once they're stable. Work started on 15 October (Day 4 of the 20-day plan).

| Step | Dates | Builds | Done when |
| --- | --- | --- | --- |
| 1. Foundation | 15–16 Oct | Repo, Next.js, Tailwind, Supabase schema, security rules, status trigger, seed data, basic layout | Migrations run on a fresh project; security tests pass |
| 2. Booking engine | 17–19 Oct | OTP, booking creation, seat locking, uploads, three basic forms, Track My Booking | A request can be submitted and tracked for each category |
| 3. Admin | 20–22 Oct | Login, roles, pipeline, request detail, all actions, events, settings, audit log | A request can go from Submitted to Confirmed by staff |
| 4. Payments and messages | 23–25 Oct | Manual payment flow, email, SMS OTP, WhatsApp templates, scheduled reminders | Every status sends the right message on each channel |
| 5. Frontend design | 26–28 Oct | Home, About, Media, Events, FAQ, legal pages; full visual design; real content | Client signs off the look on phone and desktop |
| 6. QA and launch | 29–31 Oct | End-to-end tests, fixes, domain, production keys, go live | Every acceptance check below passes on production |

Launch acceptance checks:

- [ ] A visitor submits each of the three forms on a phone, verifies OTP and gets a Booking ID on screen, WhatsApp and email
- [ ] Submitting twice with the same phone and category shows the existing Booking ID
- [ ] Two people booking the last meetup seat at the same moment: one gets the seat, the other is waitlisted
- [ ] An admin approves a request; the requester gets payment details and the deadline
- [ ] The requester submits a UTR; an admin marks it paid; the booking is Confirmed and both sides are notified
- [ ] A reused UTR is refused
- [ ] An unpaid booking turns Overdue after its deadline and can be released; the next waitlisted person can be offered the slot
- [ ] A Category manager can't see other categories or mark payments
- [ ] The client approver can approve a flagged request from a phone
- [ ] Every staff action appears in the audit log
- [ ] Public pages meet the 2.5-second load target on a mid-range phone

## Out of scope and open questions

Not in Phase 1: Razorpay or any payment gateway, automatic hold expiry and waitlist offers (admins do these by hand), the AI voice and text assistant, WhatsApp chatbot, Google Calendar sync, round-robin assignment, analytics reports, fan wall, fan club and merchandise.

Open questions, needed before the step shown:

- [ ] Advance rules, hold windows and minimum budgets per category (step 3)
- [ ] UPI ID, QR code and bank account that receive advances (step 4)
- [ ] Business documents for WhatsApp Business verification, and the sender phone number (apply now)
- [ ] Fan meetup format: paid tickets, free with registration, or both (step 2)
- [ ] Who is the client approver, and above what value does a request need their sign-off (step 3)
- [ ] Domain name and who owns the Vercel and Supabase accounts (step 1)
- [ ] Final content: bio, photos, videos, policies, FAQ answers (step 5)
