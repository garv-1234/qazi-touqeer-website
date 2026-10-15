# Admin Dashboard — Detailed Spec

Oct 15, 2026 · CodeAssure Pvt Ltd

How the CodeAssure team and the client manage every request at /admin: screens, roles, actions, rules and messages. It extends PRD section FR-A and is written to be handed to Claude Code as is.

## Access, login and layout

Only active staff can open anything under /admin; every page and every API route checks the role again on the server, never trusting what the browser shows.

**Pages**

| Page | Path | Who |
| --- | --- | --- |
| Login | `/admin/login` | Anyone (staff accounts only) |
| Set password | `/admin/set-password` | Invited staff, from the invite email link |
| Pipeline | `/admin` | All staff |
| Request detail | `/admin/bookings/[code]` (e.g. /admin/bookings/QT-2610-0042) | All staff, limited by category |
| Client sign-off | `/admin/approvals` | Client approver (also visible to Super admin and Admin) |
| Events | `/admin/events` and `/admin/events/[id]` | Super admin, Admin, and Category managers of Fan Meetup |
| Settings | `/admin/settings` | Super admin |
| Staff | `/admin/staff` | Super admin |
| Audit log | `/admin/audit` | Super admin |

**Login**

- Email and password (Supabase Auth). No public sign-up; no "create account" link.
- Wrong email or password: "Email or password is incorrect." (never says which).
- Account not in `staff_profiles` or deactivated: "This account doesn't have access. Contact your admin."
- 5 failed attempts in 15 minutes for one email: "Too many attempts. Try again in 15 minutes."
- **Forgot password?** sends a reset email; the screen always says "If this email has an account, we've sent a reset link."
- Session ends after 12 hours, or at once when the account is deactivated. Expired session: back to login with "Please log in again." and a return to the page they were on.
- Every page under /admin is marked no-index for search engines.

**Layout**

- Desktop: left sidebar (Pipeline, Approvals, Events, Settings, Staff, Audit log; items shown by role) with the staff member's name, role and **Log out** at the bottom.
- Phone: top bar with a menu button; the pipeline opens in list view by default.
- A small badge on Pipeline shows the number of requests that need action (Submitted, Payment submitted, Overdue); on Approvals, the number waiting for client sign-off.
- All times are shown in India time as "15 Oct, 2:30 pm"; amounts as ₹1,00,000.

**What each role sees**

|  | Super admin | Admin | Category manager | Client approver |
| --- | --- | --- | --- | --- |
| Bookings | All | All | Own categories only | All (read-only) |
| Requester phone and email | Full | Full | Full on detail page; masked in lists (98••••63) | Masked |
| Payments panel | Yes | Yes | Amount due only | Yes |
| Booking actions | All | All | All except payment actions | Client approve or decline only |
| Events | Yes | Yes | If they manage Fan Meetup | View only |
| Settings, staff, audit log | Yes | No | No | No |

## Pipeline

The home screen of /admin, where staff see every open request and what needs doing next. It has a board view (desktop default) and a list view (phone default), with the choice remembered per person.

**Board columns, left to right**

| Column | Shows bookings in | Sorted by |
| --- | --- | --- |
| New | Submitted | Oldest first |
| Waitlist | Waitlisted | Oldest first (the waitlist order) |
| In review | In review, Info requested | Oldest first |
| Awaiting payment | Payment pending, not overdue | Deadline, soonest first |
| Overdue | Payment pending, deadline passed | Deadline, oldest first |
| Verify payment | Payment submitted | Oldest first |
| Confirmed | Confirmed, event in the future | Event or preferred date, soonest first |

Each column header shows a count. Closed bookings (Completed, Declined, Expired, Cancelled) are hidden by default and shown with the **Show closed** filter.

**Card content:** Booking ID, category icon and name, requester name, the key detail (podcast show name, meetup city and date, or event name), preferred or event date, age ("2 days ago"), owner's initials, and flag badges. Clicking a card opens the request detail.

**Flag badges**

| Badge | When |
| --- | --- |
| Overdue | Payment pending and the deadline has passed |
| Below minimum | `below_minimum` is true |
| Needs client sign-off | `needs_client_approval` is true and the client hasn't decided |
| Client approved / Client declined | After the client decides |
| Restricted category | Event type Brand collaboration and a restricted category (betting, alcohol, tobacco, health claims), or those words in the brand or notes |
| Info requested | Status Info requested; shows "Replied" once the requester has answered |
| Unassigned | No owner |

**List view columns:** Booking ID, status, category, name, phone (masked for Category managers), key detail, date, owner, created, flags. Click a column header to sort; 50 rows per page.

**Filters** (above both views, kept in the address bar so a filtered view can be shared):

- Category (multi-select; Category managers see only theirs)
- Owner: Anyone, Me, Unassigned, or a named staff member
- Flags: Overdue, Needs client sign-off, Below minimum, Restricted category
- Date: created in the last 7, 30 or 90 days, or a custom range
- Show closed (off by default)

**Search** box: matches Booking ID (full or the last 4 digits), requester name, phone number (any 4+ digits) or email. Results appear as you type, after 3 characters.

**Freshness:** the pipeline refreshes every 60 seconds and when the tab comes back into focus. "Updated just now" sits next to the filters.

## Request detail

One page per booking with everything needed to decide, and only the actions that are valid right now.

**Header** (stays visible while scrolling): Booking ID with a copy button, status chip, category, flag badges, owner (with **Assign**), created time, and the action buttons for this status and role (see Actions). On a phone the actions sit in a bar at the bottom of the screen.

**Panels, top to bottom**

| Panel | Contents |
| --- | --- |
| Next step | One line saying what's needed, e.g. "New request — start a review", "Waiting for the requester's payment until 18 Oct, 6:00 pm (in 2 days)", "Payment submitted — check UTR 412345678901 for ₹5,000 in the bank account" |
| Requester | Name, WhatsApp number with a **Copy** and a **WhatsApp** link (opens wa.me), "Verified" badge with time, email with copy, city, how they heard about Qazi |
| Request | Every answer from the form, using the spec labels and section order, never raw keys. Lists as chips; links clickable (open in a new tab); amounts in ₹; dates in full. For meetups: the event card with seats left now. |
| Attachments | File name, type, size, uploaded time; **View** opens a signed link valid for 5 minutes. Images show a thumbnail. |
| Payment | Shown from Payment pending onwards. Advance amount, deadline (and "extended" if so). Each payment submission: amount paid, UTR, paid-on date, screenshot (view), status, and who verified or rejected it, when and why. |
| Notes and messages | One timeline mixing staff notes (grey, "Internal"), questions sent to the requester and their replies (blue, "Visible to requester"). Box at the bottom to add an internal note. |
| Messages sent | Every WhatsApp, email and SMS for this booking: time, channel, template, status (queued, sent, delivered, read, failed) and the error if failed. Shows "Will be sent once messaging is set up" while step 4 isn't live. |
| History | Every status change: from, to, who (staff name, "Requester" or "System"), when and the reason. Newest first. |

**Other rules**

- If another staff member changes the booking while the page is open, a banner says "This request was updated by Riya just now." with **Reload**, and actions are blocked until reload, so two people can't act on stale information.
- A booking from a category the person can't see returns "Request not found" (the page never reveals it exists).
- **Previous / Next** arrows move through the pipeline column the page was opened from.

## Actions

A button appears only when the booking's status and the person's role allow it. Every action is checked again on the server, changes status only through `transition_booking`, and writes an `audit_log` row with before and after values.

Roles: **SA** Super admin, **A** Admin, **CM** Category manager (own categories), **CA** Client approver.

| Action | Available when | Who | Inputs | Confirmation | Result | Requester message |
| --- | --- | --- | --- | --- | --- | --- |
| Assign | Any open booking | SA, A, CM | Staff member (only those who can see the category) | — | Owner set | — |
| Start review | Submitted | SA, A, CM | — | — | In review; owner set to the person if empty | — |
| Request info | In review | SA, A, CM | Question, 10–1,000 characters (visible to the requester) | "Send this question to Priya?" | Info requested; question saved as a visible note | Info requested (FR-N2) |
| Flag for client sign-off | In review, Info requested | SA, A, CM | Note for the client (optional) | — | Needs client sign-off; client approver alerted | — |
| Approve | In review, and client approved if flagged | SA, A, CM | Advance amount (default below), payment deadline (default now + the category's hold window), optional message | "Approve and ask for ₹5,000 by 18 Oct, 6:00 pm?" | Payment pending | Payment details (FR-N3) |
| Decline | Submitted, Waitlisted, In review, Info requested | SA, A, CM | Reason (list below) and optional message | "Decline this request? Priya will be told." | Declined | Declined (FR-N8), with the reason's text |
| Mark paid | Payment submitted | SA, A | Two required ticks: "I found this UTR in the bank or UPI account" and "The amount received is ₹5,000 or more" | "Confirm ₹5,000 (UTR 412345678901)? This confirms the booking." | Payment verified; Confirmed | Confirmed (FR-N6) |
| Reject payment | Payment submitted | SA, A | Reason (list below), optional message, optional "also extend the deadline by 24 hours" | — | Payment rejected; back to Payment pending | Payment rejected (FR-N7) |
| Extend deadline | Payment pending, once per booking | SA, A, CM | New deadline (default +24 hours, at most +7 days) | — | Deadline updated; marked "extended" | Deadline extended (new template) |
| Release slot | Payment pending and overdue | SA, A, CM | Optional note | "Release this slot? The booking will expire and Priya will be told." | Expired; seat freed; the meetup's waitlist is shown | Expired (FR-N9) |
| Offer seat | Waitlisted, and the meetup has enough seats | SA, A, CM | — | "Offer a seat to Priya?" | Submitted, ready for review | Seat available (new template) |
| Mark completed | Confirmed and the event date has passed | SA, A, CM | — | — | Completed | — |
| Cancel | Any open or Confirmed booking (CM only before payment) | SA, A, CM | Reason; if paid: refund decision (Full, Partial with amount, None) | "Cancel this booking? This can't be undone." | Cancelled; seat freed; refund decision recorded | Cancelled (FR-N10), with refund terms |
| Client approve or decline | Needs client sign-off, no decision yet | CA; SA can record it on the client's behalf | Optional comment | — | Client decision saved; owner alerted | — |
| Add note | Any booking | All | Text, 1–5,000 characters | — | Internal note saved | — |

**Default advance amount** (editable before approving):

- Percent categories (Podcast, Event): budget × the category percentage, rounded to the nearest ₹100. With no budget, the field starts empty and must be filled.
- Fan Meetup: ticket price × number of people × the category percentage (100% by default).
- The deadline must be at least 1 hour away and at most 14 days.

**Decline reasons:** Not available on these dates; Budget below our minimum; Not the right fit; Restricted product or category; Incomplete or unverifiable details; Other (message required). Each maps to a polite sentence in the decline message.

**Reject-payment reasons:** UTR not found in our account; Amount doesn't match; Paid to the wrong account; Screenshot unclear or invalid; Other (message required).

**Errors**

- The database refuses the move (someone changed it first): "This request has changed since you opened it. Reload to see its current status."
- No seats left on Approve or Offer seat: "No seats left for this meetup. Keep it on the waitlist or decline."
- Client sign-off pending on Approve: the button is disabled with "Waiting for client sign-off."
- Mark paid while the amount received is below the advance: disabled with "Amount is short. Reject the payment with the reason 'Amount doesn't match'."

## Events and waitlist

Fan meetups are created and run from /admin/events; nothing needs editing in Supabase by hand any more.

**Events list:** one row per meetup with title, city, date and time, status (Draft, Published, Closed), seat bar (confirmed, held, free out of capacity) and waitlist count. Tabs: Upcoming (default) and Past. **New meetup** button at the top.

**Create and edit form**

| Label | Key | Required | Rules | Error message |
| --- | --- | --- | --- | --- |
| Title | `title` | Yes | 3–100 characters | Enter a title. |
| City | `city` | Yes | 2–60 characters | Enter the city. |
| Venue name and address | `venue` | Yes | 5–200 characters | Enter the venue. |
| Starts | `starts_at` | Yes | Date and time, India time, at least 48 hours ahead when publishing | Start time must be at least 48 hours from now to publish. |
| Ends | `ends_at` | No | After the start | End time must be after the start. |
| Capacity (people) | `capacity` | Yes | 1–5,000; never below seats already held or confirmed | Capacity can't be lower than the N seats already taken. |
| Ticket price (₹) | `ticket_price` | Yes | 0 means free; 0–₹50,000 | Enter a price (0 for free). |
| Notes for staff | `notes` | No | Max 1,000 characters | — |

**Status rules**

- **Draft:** not visible to the public. Can be edited freely or deleted.
- **Publish:** confirmation "Publish this meetup? It will appear on the website immediately." Needs a start time at least 48 hours away.
- **Published:** visible on the website; bookings stop automatically 24 hours before the start. Price can't change once anyone has paid; other edits are allowed and logged.
- **Close:** stops new requests at once ("Close bookings for this meetup?"). Existing bookings are untouched.
- An event with any bookings can't be deleted, only closed.

**Event page** (/admin/events/\[id\])

- Details and a seat summary: "38 confirmed, 4 held (awaiting payment), 8 free of 50" plus waitlist count.
- **Attendees:** confirmed bookings with Booking ID, name, number of people, guest or guardian name, and a phone column masked for Category managers. **Download list (CSV)** for the event-day entry desk.
- **Waitlist:** waitlisted bookings in arrival order, each with **Offer seat** (enabled only while enough seats are free). When a held booking expires or is cancelled, a banner shows: "2 seats just opened. Offer them to the waitlist."
- **Holds:** bookings awaiting payment with their deadlines, so overdue holds can be released from here.

## Settings and staff

Super admin only. Every save shows "Saved" and writes an audit row with the old and new values.

**Settings tabs**

| Tab | Fields | Rules |
| --- | --- | --- |
| Payment details | UPI ID, UPI QR image, account holder name, account number, IFSC, bank name | UPI ID like name@bank; IFSC 11 characters (4 letters, 0, 6 letters or digits); QR as PNG or JPG up to 2 MB. A **Preview** shows exactly what requesters will see. Approve is blocked with "Add payment details in Settings first." until a UPI ID or bank account is saved. |
| Booking rules | Per category: active on/off, advance type and value, hold window in hours, minimum budget, response-time text | Percent 1–100; hold window 1–168 hours; turning a category off hides its form and shows "Not taking requests right now" |
| Notifications | WhatsApp, SMS and email on/off | At least one channel must stay on |
| Website | Status line on the home page, consent version | Changing the consent version applies to new requests only |

**Staff page**

- Table: name, email, role, categories (for Category managers), status (Active, Invited, Deactivated), last login.
- **Invite staff:** full name, email, role, and categories if Category manager. Sends a Supabase invite email; the person sets a password at /admin/set-password. The invite expires after 7 days and can be resent.
- **Edit:** change role or categories; takes effect on the person's next page load.
- **Deactivate:** "Deactivate Riya? She'll be logged out at once." Bookings she owns stay assigned and show "(deactivated)" until reassigned. Reactivate is available.
- A Super admin can't deactivate or demote themselves, and there must always be at least one active Super admin.

## Audit log and export

**Audit log** (/admin/audit, Super admin, read-only): time, staff member, action, what it was on (Booking ID, event title, setting name or staff email, linked), and a **Details** toggle showing before and after values. Filters: staff member, action type, date range, Booking ID. Newest first, 100 rows per page. Logged actions: every booking action in the Actions table, logins and failed logins, event create, edit, publish, close and delete, settings changes, staff invite, edit, deactivate and reactivate, and every CSV export.

**CSV export** (Pipeline, **Export** button, Super admin and Admin): exports the bookings matching the current filters. Columns: Booking ID, status, category, created, requester name, phone, email, city, preferred date, key detail, budget, advance amount, payment deadline, amount paid, UTR, owner, flags. File name `bookings-2026-10-15.csv`; Indian date format; UTF-8 so Hindi names open correctly in Excel. Each export is logged with its filters and row count.

## Acceptance tests

Run with four test logins, one per role, in the test Supabase project.

**Access**

- [ ] /admin without logging in goes to the login page; after login it returns to /admin
- [ ] A wrong password and an unknown email show the same message
- [ ] A deactivated staff member is logged out on their next click
- [ ] A Fan Meetup Category manager can't see a podcast booking in the pipeline, by search, or by typing its URL ("Request not found")
- [ ] Calling an action API directly with another role's session is refused

**Full booking journey** (one per category)

- [ ] Submitted, then Start review, Request info, requester replies on /track, Approve, requester submits a UTR, Mark paid: Confirmed
- [ ] Each step shows in History with the right person, and in the audit log
- [ ] Each step that has a requester message adds a queued row to Messages sent

**Payments**

- [ ] A Category manager sees no Mark paid or Reject payment buttons
- [ ] Mark paid needs both ticks
- [ ] Reject payment returns the booking to Awaiting payment, and the requester can submit a new UTR
- [ ] After the deadline the booking moves to Overdue; Release slot expires it and frees the seat
- [ ] Extend deadline works once; the button is gone afterwards
- [ ] Approve is blocked until payment details are saved in Settings

**Client sign-off**

- [ ] A flagged request can't be approved until the client approves it from /admin/approvals on a phone
- [ ] The client approver sees no other action buttons

**Meetups**

- [ ] Create a draft, publish it, see it on /book/fan-meetup; close it and it disappears
- [ ] Capacity can't go below seats taken
- [ ] Fill the event; the next request is waitlisted; expire a hold; the seats-opened banner shows; Offer seat moves the waitlisted request to Submitted
- [ ] The attendee CSV opens in Excel with the right names

**Conflicts**

- [ ] Two staff open the same request; one approves; the other sees the "updated by" banner and can't act until reload

## Decisions to confirm

| Decision | Default in this spec |
| --- | --- |
| Who can mark payments | Super admin and Admin only |
| Category managers and cancelling | Only before payment |
| Client approver | Qazi's manager; sees all requests, phones masked, can only approve or decline flagged requests |
| Which requests need client sign-off | Flagged by staff case by case (no automatic rule yet) |
| Payment deadline limits | At least 1 hour, at most 14 days; one extension of up to 7 days |
| Meetup publishing | At least 48 hours before the start |
| Session length | 12 hours |
| Refunds | Decided and recorded in the dashboard; the money is sent by bank transfer outside the system |

Requester messages are queued in this step and actually sent in step 4 (notifications); two new templates are needed there: Deadline extended and Seat available.
