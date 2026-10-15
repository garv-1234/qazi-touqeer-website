# Booking Forms — Detailed Spec

Oct 15, 2026 · CodeAssure Pvt Ltd

The exact fields, labels, rules and messages for the Podcast, Fan Meetup and Miscellaneous Event forms. It extends PRD sections FR-B and FR-W4 and is written to be handed to Claude Code as is.

## How every form works

All three forms follow the same three steps and the same rules; only the fields in step 2 differ.

1. **Verify phone.** WhatsApp number plus OTP (already built). After verification the number shows read-only with a **Change** link that clears verification.
2. **Details.** The common fields, then the category's own fields, grouped under short section headings.
3. **Review and send.** A read-only summary with an **Edit** link per section, the consent boxes, and the **Send request** button.

| Behaviour | Rule |
| --- | --- |
| Progress | "Step X of 3" with the step name at the top of the card |
| Validation timing | Each field is checked when the visitor leaves it, and every field again on Continue or Send. Errors appear in red under the field. |
| Error summary | On a failed Continue or Send, a box at the top lists every error as a link to its field, and the page scrolls to the first one |
| Conditional fields | Fields shown only after a choice (marked "Shown when" below) are required only while visible; hiding one clears its value |
| Text | Leading and trailing spaces are trimmed; repeated spaces collapse to one |
| Money | Rupee amounts accept digits only, are shown with Indian commas (₹1,00,000) and are stored as whole rupees |
| Dates | Date picker; shown as "Sat, 25 Oct 2026"; stored as YYYY-MM-DD in India time |
| Drafts | Typed answers are saved in the browser per form (never files or the OTP token). On return: "Continue where you left off?" with Continue and Start over. Cleared after a successful send. |
| Verification expiry | If phone verification has expired by Send, a pop-up asks for a new code; all answers stay in place |
| Double sends | The Send button turns to "Sending…" and is disabled until the server answers |
| Mobile | Works at 360 px wide; one column; the right keyboard per field (number pad for amounts, email keyboard for email) |
| Accessibility | Every field has a visible label; required fields marked with \*; errors linked to their field for screen readers |

The `Key` column in the tables below is the name used in the database (`details` JSON for category fields) and in the admin dashboard, so the frontend, backend and admin use the same names.

## Common fields

These appear first in step 2 of every form, under the heading **Your details**. The consent boxes sit on the review step.

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Full name | `name` | Text | Yes | 2–80 characters; letters, spaces, `.` `'` `-` only | — | Enter your full name (letters only, at least 2). |
| WhatsApp number | `phone` | Verified in step 1 | Yes | Read-only here, with a Change link | We'll send booking updates here. | — |
| Email | `email` | Email | Yes | Valid format, max 254 characters, stored in lower case | We'll also send updates and your receipt here. | Enter a valid email, like name@example.com. |
| City | `city` | Text | Yes | 2–60 characters | The city you're based in. | Enter your city. |
| Preferred date | `preferred_date` | Date | Podcast and Event only | Podcast: at least 3 days from today; Event: at least 7 days; both: within 12 months | Not final — we'll confirm after review. | Podcast: Choose a date at least 3 days from today. Event: Choose a date at least 7 days from today. |
| Backup date | `backup_date` | Date | No | Same limits; must differ from the preferred date | Helps us find a slot faster. | Choose a different date from your preferred one. |
| How did you hear about Qazi? | `source` | Select | No | Instagram, YouTube, Bigg Boss, Friend or family, News or press, Other | — | — |

Fan Meetup has no date fields: the chosen meetup sets the date.

**Consent** (review step, all forms):

| Label | Key | Required | Error message |
| --- | --- | --- | --- |
| I agree to the Terms, Privacy Policy and Refund Policy. | `consent_terms` | Yes | Please accept the terms to send your request. |
| I agree to receive booking updates on WhatsApp, SMS and email. | `consent_messages` | Yes | We need this to send your booking updates. |

The consent version (from settings) and the time of sending are stored with the booking.

## Podcast / Interview form

Page title: **Podcast / Interview**. Intro: "Invite Qazi to your podcast, YouTube show or interview. Tell us about your show and what you'd like to talk about."

**Section: Your show**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Show or channel name | `show_name` | Text | Yes | 2–100 characters | — | Enter your show or channel name. |
| Where is it published? | `platforms` | Multi-select chips | Yes, at least 1 | YouTube, Spotify, Instagram, Apple Podcasts, Other | Pick all that apply. | Pick at least one platform. |
| Channel link | `channel_url` | URL | Yes | Starts with https://, max 300 characters | Link to your channel or show page. | Enter a full link starting with https:// |
| Another link | `extra_url` | URL | No | Same rules | A popular episode, or your Instagram. | Enter a full link starting with https:// |
| Audience size | `audience_size` | Select | Yes | Under 10K, 10K–50K, 50K–1 lakh, 1–5 lakh, 5–10 lakh, 10 lakh+ | Followers or subscribers on your main platform. | Choose your audience size. |

**Section: The episode**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Format | `format` | Radio | Yes | In your studio; Remote (video call); Live, at an event | — | Choose a format. |
| Studio or venue address | `venue_address` | Text | Shown when format is studio or live | 10–200 characters | Full address with area and city. | Enter the full address. |
| Recording length | `duration` | Select | Yes | 30 min, 45 min, 1 hour, 90 min, 2 hours or more | — | Choose how long the recording will be. |
| Language | `language` | Radio | Yes | Hindi, English, Hinglish, Other | — | Choose a language. |
| Which language? | `language_other` | Text | Shown when Other | 2–40 characters | — | Enter the language. |
| Topic and sample questions | `topic` | Text area | Yes | 30–1,500 characters, with a live counter | What would you like to talk about? Add 3–5 sample questions. | Tell us a bit more about the topic (at least 30 characters). |

**Section: The offer**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| What are you offering? | `offer_type` | Radio | Yes | Paid appearance; Collaboration, no fee; Not sure yet, let's discuss | — | Choose an option. |
| Fee offered (₹) | `budget` | Amount | Shown when Paid appearance | ₹1 to ₹1,00,00,000 | Your fee for Qazi, before GST. | Enter the fee in rupees. |
| Anything else we should know? | `notes` | Text area | No | Max 1,000 characters | — | Keep this under 1,000 characters. |

`budget` is saved to the booking's `budget` column (used for the minimum-budget check); every other key goes into `details`.

## Fan Meetup form

Page title: **Meet Qazi**. Intro: "Pick a meetup near you. Seats are limited, and your seat is confirmed only after payment."

**Section: Choose a meetup** (shown before Your details, because the event decides everything else)

Each published meetup shows as a selectable card: city (large), venue, day, date and time, ticket price, and seats left. The seats left come from the server and refresh when the page loads and when a card is picked.

| Seats left | Card shows | Can pick? |
| --- | --- | --- |
| 11 or more | "Seats available" | Yes |
| 1–10 | "Only N seats left" in amber | Yes |
| 0 | "Full — join the waitlist" | Yes, as waitlist |
| Event starts in under 24 hours | "Bookings closed" | No (card greyed) |

With no published meetups, the page shows: "No meetups are open right now. New dates are announced on Qazi's Instagram first." plus an Instagram link. The form is hidden.

**Section: Who's coming**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Your age | `age_group` | Radio | Yes | "I'm 18 or older"; "I'm under 18 — a parent or guardian will come with me" | — | Please confirm your age. |
| How many people? | `party_size` | Radio, 1 or 2 | Yes | Shown only when 18+. Set to 2 automatically when under 18. | Maximum 2 per booking. | Choose 1 or 2. |
| Second person's full name | `guest_name` | Text | Shown when 18+ and 2 people | 2–80 characters, letters only | They must bring photo ID. | Enter their full name. |
| Parent or guardian's full name | `guardian_name` | Text | Shown when under 18 | 2–80 characters, letters only | They must attend with you and bring photo ID. | Enter your parent or guardian's name. |
| Parent or guardian's phone | `guardian_phone` | Phone | Shown when under 18 | Same rules as the WhatsApp number; must differ from it | — | Enter a valid phone number that's different from yours. |
| A message for Qazi | `message` | Text area | No | Max 300 characters | Short and sweet — he may read it out! | Keep this under 300 characters. |

**Price summary** (below the section, updates live): "Ticket ₹999 × 2 = ₹1,998. You'll pay only after your request is approved." For a free meetup: "Free entry. Registration required."

**Seat rules on screen**

- If 1 seat is left and 2 people are chosen (or under 18): "Only 1 seat left. Your request will join the waitlist, or choose 1 person."
- If the meetup fills between choosing and sending, the request is still saved, as Waitlisted, and the success screen says so (see Errors and success).

**Meetup rules box** (review step, required): "I've read the meetup rules: photo ID for everyone, entry closes 15 minutes after start, no gifts or bags beyond a small purse, and entry is refused for misbehaviour." Key `consent_rules`. Error: "Please accept the meetup rules."

## Miscellaneous Event form

Page title: **Events and collaborations**. Intro: "Shows, college fests, launches, brand collaborations and private events. Tell us about your event and we'll get back with availability and terms."

**Section: About you**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| You're booking as | `organiser_type` | Radio | Yes | Company or brand; College or university; Event agency; Individual | — | Choose one. |
| Organisation name | `organisation` | Text | Shown when not Individual | 2–120 characters | — | Enter the organisation's name. |
| Your role | `designation` | Text | Shown when not Individual | 2–80 characters | e.g. Marketing Manager, Fest Coordinator | Enter your role. |
| GSTIN | `gstin` | Text | No | 15 characters, valid GSTIN format, upper case | Needed for a GST invoice. | Enter a valid 15-character GSTIN. |
| Website or social link | `org_url` | URL | No | Starts with https:// | Helps us verify your organisation faster. | Enter a full link starting with https:// |

**Section: The event**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Type of event | `event_type` | Select | Yes | Show or appearance; College fest; Store or product launch; Brand collaboration (content); Corporate event; Wedding or private event; Other | — | Choose the type of event. |
| Describe it | `event_type_other` | Text | Shown when Other | 3–80 characters | — | Tell us what kind of event it is. |
| Event name | `event_name` | Text | Yes, unless Brand collaboration | 2–120 characters | — | Enter the event's name. |
| Venue and address | `venue_address` | Text | Yes, unless Brand collaboration | 10–200 characters | Venue name, area and city. | Enter the venue and address. |
| Start time | `start_time` | Time | Yes, unless Brand collaboration | — | On the preferred date. | Choose a start time. |
| How long is Qazi needed? | `duration` | Select | Yes | 1 hour, 2 hours, 3 hours, Half day, Full day, More than one day | — | Choose how long. |
| Expected audience | `audience` | Select | Yes, unless Brand collaboration | Under 200; 200–500; 500–2,000; 2,000–10,000; 10,000+ | — | Choose the expected audience. |
| What would Qazi do? | `roles` | Multi-select chips | Yes, at least 1 | Guest appearance; Judge; Host or anchor; Performance; Meet-and-greet; Social media content; Other | Pick all that apply. | Pick at least one. |

**Section: Brand collaboration** (shown only when Type is Brand collaboration)

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Brand or product | `brand` | Text | Yes | 2–100 characters | — | Enter the brand or product. |
| Product category | `brand_category` | Select | Yes | Fashion; Beauty and grooming; Food and drink; Tech and gadgets; Apps and gaming; Finance; Health and fitness; Other | — | Choose a category. |
| Deliverables | `deliverables` | Multi-select chips | Yes, at least 1 | Instagram reel; Instagram story; Instagram post; YouTube video; Event appearance | — | Pick at least one deliverable. |
| Usage rights | `usage_rights` | Select | Yes | Organic only; 1 month paid ads; 3 months; 6 months; 12 months | How long you'll use the content in ads. | Choose usage rights. |

**Section: Budget and logistics**

| Label | Key | Type | Required | Rules | Help text | Error message |
| --- | --- | --- | --- | --- | --- | --- |
| Travel and stay | `travel` | Radio | Yes, unless Brand collaboration | We'll arrange travel and stay; Local, no travel needed; To be discussed | — | Choose an option. |
| Budget for Qazi's fee (₹) | `budget` | Amount | Yes | ₹1 to ₹1,00,00,000 | Fee only, before GST, excluding travel and stay. | Enter your budget in rupees. |
| Event brief | `brief` | File | No | One file; PDF, JPG, PNG or WEBP; max 10 MB | A deck, poster or brief helps us decide faster. | Wrong type: Upload a PDF, JPG, PNG or WEBP file. Too large: This file is over 10 MB. |
| Anything else? | `notes` | Text area | No | Max 1,500 characters | — | Keep this under 1,500 characters. |

Category rule: requests for betting, alcohol, tobacco or unproven health claims are not hidden from the form, but the admin dashboard flags them for a quick decline (exact list in Decisions).

## Review, success and errors

**Review step.** Every answer grouped by section as label and value, with an **Edit** link per section that jumps back with answers kept. Empty optional fields are left out. Below them: the consent boxes, the Meetup rules box (meetups only), and the **Send request** button.

**Success screen** (replaces the form; the browser Back button doesn't resubmit):

- Heading: "Request sent" (or "You're on the waitlist" for a waitlisted meetup).
- The Booking ID in large type, with a **Copy** button that shows "Copied" for 2 seconds.
- "We've also sent this to your WhatsApp and email. Keep it to track your request."
- **What happens next:** 1. Our team reviews your request (response time from the category, e.g. "within 3 working days"). 2. If approved, you'll get payment details on WhatsApp and email. 3. Your booking is confirmed once payment is verified.
- Waitlist version: "This meetup is full right now. If a seat opens up, we'll message you in the order requests arrived."
- Buttons: **Track this request** (opens /track with the ID filled in) and **Back to home**.

**Errors.** No error ever clears the visitor's answers.

| Situation | Where | Message | What happens |
| --- | --- | --- | --- |
| Already have an open request in this category | Replaces the Send area | "You already have an open request (QT-2610-0042). You can track it or wait for it to close before sending a new one." | Shows **Track it**; the draft is kept |
| Meetup closed or removed while filling | Top of form | "This meetup is no longer taking bookings. Please choose another." | Returns to the meetup cards |
| Meetup filled while filling | Success screen | Waitlist version of the success screen | Saved as Waitlisted |
| Verification expired | Pop-up | "For your security, please verify your number again." | New code; then the send continues automatically |
| Too many codes | Under the Send code button | "Too many codes requested. Please try again in an hour." | Button disabled |
| Wrong code | Under the code box | "That code isn't right. N tries left." | After 5 tries: "Please request a new code." |
| Code expired | Under the code box | "This code has expired. Please request a new one." | Shows Resend |
| Too many requests from this network | Top of form | "Too many requests from your network. Please try again in a little while." | Send disabled for the shown time |
| File too large or wrong type | Under the file field | As in the field table | File is not uploaded |
| File upload failed | Under the file field | "Upload failed. Check your connection and try again." | **Retry** button |
| No internet | Top of form | "You seem to be offline. Your answers are saved — try again when you're back online." | **Try again** button |
| Server error | Top of form | "Something went wrong on our side. Your answers are saved. Please try again in a minute." | **Try again**; error logged with a reference shown to the visitor |
| Bot check failed | Top of form | "Please wait a moment and try again." | No detail about the check is revealed |

## Acceptance tests

Run each on a phone-sized screen (360 px) and on desktop.

**All forms**

- [ ] Continue with every field empty: the summary lists every required field, and the page scrolls to the first
- [ ] Leaving a field with a bad value shows its exact error message from this spec
- [ ] Close the tab halfway, reopen the form: "Continue where you left off?" restores every answer
- [ ] Review step shows every answer; Edit returns to the right section with answers kept
- [ ] Send without ticking consent: both consent errors show
- [ ] Double-tap Send: only one booking is created
- [ ] Turn off Wi-Fi and Send: the offline message shows, and answers are kept
- [ ] Success screen: Copy copies the ID; Track this request opens /track with the ID filled in
- [ ] The booking's `details` in Supabase uses exactly the keys in this spec

**Podcast**

- [ ] A preferred date 2 days from today is refused; 3 days is accepted
- [ ] Choosing Remote hides the address field; choosing Studio requires it
- [ ] Choosing Paid appearance requires the fee; switching away clears it
- [ ] A 29-character topic is refused; the counter shows the length

**Fan Meetup**

- [ ] With no published meetups, the empty-state message shows and the form is hidden
- [ ] A meetup with 3 seats shows "Only 3 seats left"; a full one shows "Full — join the waitlist"
- [ ] Under 18 sets 2 people and requires the guardian's name and phone; the same phone as the requester is refused
- [ ] The price summary updates when switching between 1 and 2 people
- [ ] Fill the last seat from another browser before sending: the request saves as Waitlisted and the waitlist success screen shows

**Miscellaneous Event**

- [ ] Individual hides Organisation name and Role
- [ ] Brand collaboration shows the brand section and hides event name, venue, start time, audience and travel
- [ ] An invalid GSTIN is refused; a valid one is accepted and stored in upper case
- [ ] A 12 MB PDF and a .docx file are both refused with the right message; a 2 MB PDF uploads

## Decisions to confirm with the client

The spec uses these defaults; changing any of them is a small edit.

| Decision | Default in this spec |
| --- | --- |
| Minimum notice | Podcast 3 days, Event 7 days |
| Meetup group size | Up to 2 per booking; under-18s count as 2 (with guardian) |
| Under-18 fans | Allowed with a parent or guardian attending |
| Meetup booking cut-off | 24 hours before the start |
| Meetup ticket | Paid, per person; free meetups supported |
| Meetup rules | Photo ID, 15-minute entry window, no gifts or large bags |
| Brand categories to auto-flag for decline | Betting, alcohol, tobacco, unproven health claims |
| Private events (weddings) | Accepted as an event type |
| Minimum budgets | None yet (set in admin settings later) |
