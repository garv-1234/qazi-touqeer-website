// Booking form schemas — docs/specs/booking-forms.md is the source of truth for
// every key, rule and message here. The browser runs the same schemas for
// instant feedback; the server runs them again before saving.
import { z } from "zod";
import {
  botSchema,
  bookingDate,
  httpsUrl,
  optional,
  personName,
  phoneField,
  phoneSchema,
  rupees,
  textArea,
  textField,
} from "./common";
import {
  AGE_GROUP_OPTIONS,
  AUDIENCE_SIZE_OPTIONS,
  BRAND_CATEGORY_OPTIONS,
  DELIVERABLE_OPTIONS,
  EVENT_AUDIENCE_OPTIONS,
  EVENT_DURATION_OPTIONS,
  EVENT_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  OFFER_TYPE_OPTIONS,
  optionKeys,
  ORGANISER_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  PODCAST_FORMAT_OPTIONS,
  RECORDING_LENGTH_OPTIONS,
  ROLE_OPTIONS,
  SOURCE_OPTIONS,
  TRAVEL_OPTIONS,
  USAGE_RIGHTS_OPTIONS,
  type Options,
} from "./options";
import { normalizePhone } from "./phone";

export type BookingCategory = "podcast" | "fan_meetup" | "misc_event";
/** Top-level fields and `details` fields merged into one record. */
export type Flat = Record<string, unknown>;

const choice = <T extends Options>(o: T, message: string) => z.enum(optionKeys(o), message);
const chips = <T extends Options>(o: T, message: string) =>
  z.array(z.enum(optionKeys(o), message), message).min(1, message);

// ---------------------------------------------------------------------
// Messages for fields that are required only while shown ("Shown when").
// ---------------------------------------------------------------------
const M = {
  podcast: {
    venue_address: "Enter the full address.",
    language_other: "Enter the language.",
    budget: "Enter the fee in rupees.",
  },
  fan_meetup: {
    party_size: "Choose 1 or 2.",
    guest_name: "Enter their full name.",
    guardian_name: "Enter your parent or guardian's name.",
    guardian_phone: "Enter a valid phone number that's different from yours.",
  },
  misc_event: {
    organisation: "Enter the organisation's name.",
    designation: "Enter your role.",
    event_type_other: "Tell us what kind of event it is.",
    event_name: "Enter the event's name.",
    venue_address: "Enter the venue and address.",
    start_time: "Choose a start time.",
    audience: "Choose the expected audience.",
    brand: "Enter the brand or product.",
    brand_category: "Choose a category.",
    deliverables: "Pick at least one deliverable.",
    usage_rights: "Choose usage rights.",
    travel: "Choose an option.",
  },
} as const;

// ---------------------------------------------------------------------
// When each conditional field is shown. The forms use the same rules to
// show/hide fields, so "required only while visible" matches exactly.
// ---------------------------------------------------------------------
const notBrand = (f: Flat) => f.event_type !== "brand_collab";
const isBrand = (f: Flat) => f.event_type === "brand_collab";
const isOrg = (f: Flat) => !!f.organiser_type && f.organiser_type !== "individual";

export const SHOWN_WHEN: { [C in BookingCategory]: Record<keyof (typeof M)[C], (f: Flat) => boolean> } = {
  podcast: {
    venue_address: (f) => f.format === "studio" || f.format === "live",
    language_other: (f) => f.language === "other",
    budget: (f) => f.offer_type === "paid",
  },
  fan_meetup: {
    party_size: (f) => f.age_group === "adult",
    guest_name: (f) => f.age_group === "adult" && String(f.party_size) === "2",
    guardian_name: (f) => f.age_group === "minor",
    guardian_phone: (f) => f.age_group === "minor",
  },
  misc_event: {
    organisation: isOrg,
    designation: isOrg,
    event_type_other: (f) => f.event_type === "other",
    event_name: notBrand,
    venue_address: notBrand,
    start_time: notBrand,
    audience: notBrand,
    travel: notBrand,
    brand: isBrand,
    brand_category: isBrand,
    deliverables: isBrand,
    usage_rights: isBrand,
  },
};

export function isShown(category: BookingCategory, key: string, flat: Flat): boolean {
  const rule = (SHOWN_WHEN[category] as Record<string, (f: Flat) => boolean>)[key];
  return rule ? rule(flat) : true;
}

/** Keys stored on the bookings row itself rather than in `details`. */
export const TOP_LEVEL_KEYS = ["budget", "event_id", "party_size", "brief_path"] as const;

// ---------------------------------------------------------------------
// Common block (FR-B1)
// ---------------------------------------------------------------------
const commonFields = {
  name: personName("Enter your full name (letters only, at least 2)."),
  phone: phoneSchema,
  email: z
    .string("Enter a valid email, like name@example.com.")
    .trim()
    .toLowerCase()
    .max(254, "Enter a valid email, like name@example.com.")
    .pipe(z.email("Enter a valid email, like name@example.com.")),
  city: textField(2, 60, "Enter your city."),
  source: optional(z.enum(optionKeys(SOURCE_OPTIONS))),
};

const consentFields = {
  consent_terms: z.literal(true, "Please accept the terms to send your request."),
  consent_messages: z.literal(true, "We need this to send your booking updates."),
};

export const PREFERRED_DATE_MESSAGE = {
  podcast: "Choose a date at least 3 days from today.",
  misc_event: "Choose a date at least 7 days from today.",
} as const;
export const MIN_NOTICE_DAYS = { podcast: 3, misc_event: 7 } as const;

const dateFields = (cat: "podcast" | "misc_event") => ({
  preferred_date: bookingDate(MIN_NOTICE_DAYS[cat], PREFERRED_DATE_MESSAGE[cat]),
  backup_date: optional(bookingDate(MIN_NOTICE_DAYS[cat], PREFERRED_DATE_MESSAGE[cat])),
});

// ---------------------------------------------------------------------
// Category details (strict: `details` holds exactly the spec's keys)
// ---------------------------------------------------------------------
export const podcastDetailsSchema = z.strictObject({
  show_name: textField(2, 100, "Enter your show or channel name."),
  platforms: chips(PLATFORM_OPTIONS, "Pick at least one platform."),
  channel_url: httpsUrl(),
  extra_url: optional(httpsUrl()),
  audience_size: choice(AUDIENCE_SIZE_OPTIONS, "Choose your audience size."),
  format: choice(PODCAST_FORMAT_OPTIONS, "Choose a format."),
  venue_address: optional(textField(10, 200, M.podcast.venue_address)),
  duration: choice(RECORDING_LENGTH_OPTIONS, "Choose how long the recording will be."),
  language: choice(LANGUAGE_OPTIONS, "Choose a language."),
  language_other: optional(textField(2, 40, M.podcast.language_other)),
  topic: textArea(
    30,
    1500,
    "Tell us a bit more about the topic (at least 30 characters).",
    "Keep this under 1,500 characters.",
  ),
  offer_type: choice(OFFER_TYPE_OPTIONS, "Choose an option."),
  notes: optional(textArea(0, 1000, "Keep this under 1,000 characters.", "Keep this under 1,000 characters.")),
});

export const fanMeetupDetailsSchema = z.strictObject({
  age_group: choice(AGE_GROUP_OPTIONS, "Please confirm your age."),
  guest_name: optional(personName(M.fan_meetup.guest_name)),
  guardian_name: optional(personName(M.fan_meetup.guardian_name)),
  guardian_phone: optional(phoneField(M.fan_meetup.guardian_phone)),
  message: optional(textArea(0, 300, "Keep this under 300 characters.", "Keep this under 300 characters.")),
});

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const miscEventDetailsSchema = z.strictObject({
  organiser_type: choice(ORGANISER_TYPE_OPTIONS, "Choose one."),
  organisation: optional(textField(2, 120, M.misc_event.organisation)),
  designation: optional(textField(2, 80, M.misc_event.designation)),
  gstin: optional(
    z
      .string("Enter a valid 15-character GSTIN.")
      .trim()
      .toUpperCase()
      .regex(GSTIN, "Enter a valid 15-character GSTIN."),
  ),
  org_url: optional(httpsUrl()),
  event_type: choice(EVENT_TYPE_OPTIONS, "Choose the type of event."),
  event_type_other: optional(textField(3, 80, M.misc_event.event_type_other)),
  event_name: optional(textField(2, 120, M.misc_event.event_name)),
  venue_address: optional(textField(10, 200, M.misc_event.venue_address)),
  start_time: optional(z.string(M.misc_event.start_time).regex(/^([01]\d|2[0-3]):[0-5]\d$/, M.misc_event.start_time)),
  duration: choice(EVENT_DURATION_OPTIONS, "Choose how long."),
  audience: optional(choice(EVENT_AUDIENCE_OPTIONS, M.misc_event.audience)),
  roles: chips(ROLE_OPTIONS, "Pick at least one."),
  brand: optional(textField(2, 100, M.misc_event.brand)),
  brand_category: optional(choice(BRAND_CATEGORY_OPTIONS, M.misc_event.brand_category)),
  deliverables: optional(chips(DELIVERABLE_OPTIONS, M.misc_event.deliverables)),
  usage_rights: optional(choice(USAGE_RIGHTS_OPTIONS, M.misc_event.usage_rights)),
  travel: optional(choice(TRAVEL_OPTIONS, M.misc_event.travel)),
  notes: optional(textArea(0, 1500, "Keep this under 1,500 characters.", "Keep this under 1,500 characters.")),
});

export const DETAIL_KEYS: Record<BookingCategory, string[]> = {
  podcast: Object.keys(podcastDetailsSchema.shape),
  fan_meetup: Object.keys(fanMeetupDetailsSchema.shape),
  misc_event: Object.keys(miscEventDetailsSchema.shape),
};

// ---------------------------------------------------------------------
// Cross-field rules, then strip hidden fields
// ---------------------------------------------------------------------
type Payload = Record<string, unknown> & { details?: Record<string, unknown> };

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

const pathOf = (key: string) => ((TOP_LEVEL_KEYS as readonly string[]).includes(key) ? [key] : ["details", key]);

function crossFieldRules(category: BookingCategory) {
  return (val: Payload, ctx: z.RefinementCtx) => {
    const details = (val.details ?? {}) as Record<string, unknown>;
    const flat: Flat = { ...val, ...details };
    const messages = M[category] as Record<string, string>;
    for (const key of Object.keys(messages)) {
      if (isShown(category, key, flat) && isBlank(flat[key])) {
        ctx.addIssue({ code: "custom", path: pathOf(key), message: messages[key] });
      }
    }
    if (category !== "fan_meetup" && !isBlank(val.backup_date) && val.backup_date === val.preferred_date) {
      ctx.addIssue({ code: "custom", path: ["backup_date"], message: "Choose a different date from your preferred one." });
    }
    if (category === "fan_meetup" && isShown(category, "guardian_phone", flat) && typeof flat.guardian_phone === "string") {
      const own = typeof val.phone === "string" ? normalizePhone(val.phone) : null;
      if (own && normalizePhone(flat.guardian_phone) === own) {
        ctx.addIssue({ code: "custom", path: ["details", "guardian_phone"], message: messages.guardian_phone });
      }
    }
  };
}

/**
 * Before validation: drop fields that are hidden by the visitor's choices, so a
 * stale hidden value can neither fail validation nor reach the database.
 */
function stripHidden(category: BookingCategory) {
  return (input: unknown): unknown => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const val = input as Payload;
    const details = { ...(typeof val.details === "object" && val.details ? val.details : {}) };
    const out: Payload = { ...val, details };
    const flat: Flat = { ...val, ...details };
    for (const key of Object.keys(M[category])) {
      if (isShown(category, key, flat)) continue;
      if ((TOP_LEVEL_KEYS as readonly string[]).includes(key)) delete out[key];
      else delete details[key];
    }
    // Under-18s always come with a guardian, so they count as 2 (spec).
    if (category === "fan_meetup" && details.age_group === "minor") out.party_size = 2;
    return out;
  };
}

/** Runs the cross-field rules even when single fields failed, so every error shows at once. */
const always = { when: () => true };

// ---------------------------------------------------------------------
// Per-category booking schemas: "details" stage (step 2) and full (send)
// ---------------------------------------------------------------------
const podcastBase = z.object({
  category: z.literal("podcast"),
  ...commonFields,
  ...dateFields("podcast"),
  budget: optional(rupees(M.podcast.budget)),
  details: podcastDetailsSchema,
});

const fanMeetupBase = z.object({
  category: z.literal("fan_meetup"),
  ...commonFields,
  event_id: z.uuid("Choose a meetup."),
  party_size: optional(z.union([z.literal(1), z.literal(2)], M.fan_meetup.party_size)),
  details: fanMeetupDetailsSchema,
});

const miscEventBase = z.object({
  category: z.literal("misc_event"),
  ...commonFields,
  ...dateFields("misc_event"),
  budget: rupees("Enter your budget in rupees."),
  brief_path: optional(z.string().max(300)),
  details: miscEventDetailsSchema,
});

const finish = <S extends z.ZodObject>(schema: S, category: BookingCategory) =>
  z.preprocess(stripHidden(category), schema.superRefine(crossFieldRules(category), always));

export const bookingDetailsSchemas = {
  podcast: finish(podcastBase, "podcast"),
  fan_meetup: finish(fanMeetupBase, "fan_meetup"),
  misc_event: finish(miscEventBase, "misc_event"),
};

export const bookingSchemas = {
  podcast: finish(podcastBase.extend(consentFields), "podcast"),
  fan_meetup: finish(
    fanMeetupBase.extend({ ...consentFields, consent_rules: z.literal(true, "Please accept the meetup rules.") }),
    "fan_meetup",
  ),
  misc_event: finish(miscEventBase.extend(consentFields), "misc_event"),
};

export type PodcastBooking = z.output<(typeof bookingSchemas)["podcast"]>;
export type FanMeetupBooking = z.output<(typeof bookingSchemas)["fan_meetup"]>;
export type MiscEventBooking = z.output<(typeof bookingSchemas)["misc_event"]>;
export type BookingInput = PodcastBooking | FanMeetupBooking | MiscEventBooking;

const CATEGORIES: BookingCategory[] = ["podcast", "fan_meetup", "misc_event"];
export const isBookingCategory = (c: unknown): c is BookingCategory => CATEGORIES.includes(c as BookingCategory);

/** Validates a booking for its category. `stage: "details"` skips the consent boxes (step 2). */
export function parseBooking(input: unknown, stage: "details" | "send" = "send") {
  const category = (input as { category?: unknown } | null)?.category;
  if (!isBookingCategory(category)) {
    return z.object({ category: z.enum(CATEGORIES, "Unknown booking type.") }).safeParse(input) as z.ZodSafeParseResult<BookingInput>;
  }
  const schema = (stage === "details" ? bookingDetailsSchemas : bookingSchemas)[category];
  return schema.safeParse(input) as z.ZodSafeParseResult<BookingInput>;
}

export const createBookingRequestSchema = z.object({
  token: z.string().min(10),
  booking: z.record(z.string(), z.unknown()),
  bot: botSchema,
});
