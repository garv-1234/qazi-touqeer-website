import { z } from "zod";
import { botSchema, commonSchema, optionalFutureDate, optionalText, text } from "./common";

// ---------------------------------------------------------------------
// FR-B2 Podcast / Interview
// ---------------------------------------------------------------------
export const AUDIENCE_SIZES = ["under_10k", "10k_100k", "100k_1m", "over_1m"] as const;
export const AUDIENCE_LABELS: Record<(typeof AUDIENCE_SIZES)[number], string> = {
  under_10k: "Under 10K",
  "10k_100k": "10K – 1 lakh",
  "100k_1m": "1 lakh – 10 lakh",
  over_1m: "Over 10 lakh",
};
export const PODCAST_FORMATS = ["studio", "remote", "live"] as const;
export const PODCAST_FORMAT_LABELS: Record<(typeof PODCAST_FORMATS)[number], string> = {
  studio: "In studio",
  remote: "Remote (video call)",
  live: "Live stream",
};
export const LANGUAGES = ["hindi", "english", "urdu", "kashmiri", "other"] as const;
export const LANGUAGE_LABELS: Record<(typeof LANGUAGES)[number], string> = {
  hindi: "Hindi",
  english: "English",
  urdu: "Urdu",
  kashmiri: "Kashmiri",
  other: "Other",
};

export const podcastDetailsSchema = z
  .object({
    channel_name: text(2, 120, "Enter the channel or show name"),
    channel_links: z
      .array(z.url({ protocol: /^https?$/, error: "Each link must start with https://" }))
      .min(1, "Add at least one link")
      .max(5, "Add up to 5 links"),
    audience_size: z.enum(AUDIENCE_SIZES, "Pick an audience size"),
    topic: text(10, 1000, "Describe the topic in a sentence or two"),
    sample_questions: optionalText(3000),
    format: z.enum(PODCAST_FORMATS, "Pick a format"),
    duration_minutes: z.number("Enter a duration").int().min(10, "At least 10 minutes").max(480, "At most 8 hours"),
    language: z.enum(LANGUAGES, "Pick a language"),
    fee_type: z.enum(["paid", "barter"], "Pick paid or barter"),
    fee_offered: z.number().int().min(1).max(100_000_000).optional(),
  })
  .refine((d) => d.fee_type === "barter" || d.fee_offered !== undefined, {
    path: ["fee_offered"],
    message: "Enter the fee you are offering",
  });

// ---------------------------------------------------------------------
// FR-B3 Fan Meetup
// ---------------------------------------------------------------------
export const fanMeetupDetailsSchema = z
  .object({
    event_id: z.uuid("Choose a meetup"),
    party_size: z.union([z.literal(1), z.literal(2)], "Choose 1 or 2 people"),
    is_adult: z.boolean(),
    guardian_name: optionalText(120),
    message: optionalText(500),
  })
  .refine((d) => d.is_adult || (d.guardian_name?.length ?? 0) >= 2, {
    path: ["guardian_name"],
    message: "Under 18? Enter a parent or guardian's name",
  });

// ---------------------------------------------------------------------
// FR-B4 Miscellaneous Event
// ---------------------------------------------------------------------
export const EVENT_TYPES = ["show", "college_fest", "opening", "brand_collab", "other"] as const;
export const EVENT_TYPE_LABELS: Record<(typeof EVENT_TYPES)[number], string> = {
  show: "Show",
  college_fest: "College fest",
  opening: "Opening / launch",
  brand_collab: "Brand collaboration",
  other: "Other",
};
export const TRAVEL_OPTIONS = ["organiser_provides", "to_discuss", "not_needed"] as const;
export const TRAVEL_LABELS: Record<(typeof TRAVEL_OPTIONS)[number], string> = {
  organiser_provides: "Organiser provides travel and stay",
  to_discuss: "To be discussed",
  not_needed: "Not needed (local event)",
};

export const miscEventDetailsSchema = z.object({
  organiser_name: text(2, 160, "Enter the organiser or company name"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN")
    .optional(),
  event_type: z.enum(EVENT_TYPES, "Pick an event type"),
  event_name: text(2, 160, "Enter the event name"),
  venue: text(2, 200, "Enter the venue"),
  event_city: text(2, 80, "Enter the event city"),
  duration_hours: z.number("Enter a duration").min(0.5, "At least half an hour").max(72, "At most 72 hours"),
  expected_audience: z.number("Enter the expected audience").int().min(1).max(10_000_000),
  role_expected: text(2, 300, "Tell us what Qazi would do at the event"),
  travel_stay: z.enum(TRAVEL_OPTIONS, "Pick a travel and stay option"),
  travel_notes: optionalText(1000),
  budget: z.number("Enter your budget").int().min(1, "Enter your budget").max(100_000_000),
  brief_path: z.string().max(300).optional(),
});

// ---------------------------------------------------------------------
// One request body for /api/bookings
// ---------------------------------------------------------------------
export const podcastBookingSchema = commonSchema.extend({
  category: z.literal("podcast"),
  details: podcastDetailsSchema,
});

export const fanMeetupBookingSchema = commonSchema.extend({
  category: z.literal("fan_meetup"),
  preferred_date: optionalFutureDate, // the event fixes the date
  details: fanMeetupDetailsSchema,
});

export const miscEventBookingSchema = commonSchema.extend({
  category: z.literal("misc_event"),
  details: miscEventDetailsSchema,
});

export const bookingSchema = z.discriminatedUnion("category", [
  podcastBookingSchema,
  fanMeetupBookingSchema,
  miscEventBookingSchema,
]);
export type BookingInput = z.infer<typeof bookingSchema>;
export type BookingCategory = BookingInput["category"];

export const createBookingRequestSchema = z.object({
  token: z.string().min(10),
  booking: bookingSchema,
  bot: botSchema,
});
