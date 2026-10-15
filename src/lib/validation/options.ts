// Choice lists for the booking forms (docs/specs/booking-forms.md).
// The first item of each pair is the stored value; the second is the label.
// Shared by the Zod schemas, the forms, the review step and (later) the admin.

export type Options = readonly (readonly [string, string])[];

/** Stored values of an option list, typed for z.enum(). */
export const optionKeys = <T extends Options>(o: T) =>
  o.map(([k]) => k) as unknown as [T[number][0], ...T[number][0][]];

export const optionLabel = (o: Options, key: string | undefined) => o.find(([k]) => k === key)?.[1] ?? key ?? "";

// Common
export const SOURCE_OPTIONS = [
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["bigg_boss", "Bigg Boss"],
  ["friend_family", "Friend or family"],
  ["news", "News or press"],
  ["other", "Other"],
] as const;

// Podcast / Interview
export const PLATFORM_OPTIONS = [
  ["youtube", "YouTube"],
  ["spotify", "Spotify"],
  ["instagram", "Instagram"],
  ["apple_podcasts", "Apple Podcasts"],
  ["other", "Other"],
] as const;
export const AUDIENCE_SIZE_OPTIONS = [
  ["under_10k", "Under 10K"],
  ["10k_50k", "10K–50K"],
  ["50k_1l", "50K–1 lakh"],
  ["1l_5l", "1–5 lakh"],
  ["5l_10l", "5–10 lakh"],
  ["10l_plus", "10 lakh+"],
] as const;
export const PODCAST_FORMAT_OPTIONS = [
  ["studio", "In your studio"],
  ["remote", "Remote (video call)"],
  ["live", "Live, at an event"],
] as const;
export const RECORDING_LENGTH_OPTIONS = [
  ["30m", "30 min"],
  ["45m", "45 min"],
  ["1h", "1 hour"],
  ["90m", "90 min"],
  ["2h_plus", "2 hours or more"],
] as const;
export const LANGUAGE_OPTIONS = [
  ["hindi", "Hindi"],
  ["english", "English"],
  ["hinglish", "Hinglish"],
  ["other", "Other"],
] as const;
export const OFFER_TYPE_OPTIONS = [
  ["paid", "Paid appearance"],
  ["collab", "Collaboration, no fee"],
  ["discuss", "Not sure yet, let's discuss"],
] as const;

// Fan Meetup
export const AGE_GROUP_OPTIONS = [
  ["adult", "I'm 18 or older"],
  ["minor", "I'm under 18 — a parent or guardian will come with me"],
] as const;
export const PARTY_SIZE_OPTIONS = [
  ["1", "1 person"],
  ["2", "2 people"],
] as const;

// Miscellaneous Event
export const ORGANISER_TYPE_OPTIONS = [
  ["company", "Company or brand"],
  ["college", "College or university"],
  ["agency", "Event agency"],
  ["individual", "Individual"],
] as const;
export const EVENT_TYPE_OPTIONS = [
  ["show", "Show or appearance"],
  ["college_fest", "College fest"],
  ["launch", "Store or product launch"],
  ["brand_collab", "Brand collaboration (content)"],
  ["corporate", "Corporate event"],
  ["private", "Wedding or private event"],
  ["other", "Other"],
] as const;
export const EVENT_DURATION_OPTIONS = [
  ["1h", "1 hour"],
  ["2h", "2 hours"],
  ["3h", "3 hours"],
  ["half_day", "Half day"],
  ["full_day", "Full day"],
  ["multi_day", "More than one day"],
] as const;
export const EVENT_AUDIENCE_OPTIONS = [
  ["under_200", "Under 200"],
  ["200_500", "200–500"],
  ["500_2000", "500–2,000"],
  ["2000_10000", "2,000–10,000"],
  ["10000_plus", "10,000+"],
] as const;
export const ROLE_OPTIONS = [
  ["guest_appearance", "Guest appearance"],
  ["judge", "Judge"],
  ["host", "Host or anchor"],
  ["performance", "Performance"],
  ["meet_and_greet", "Meet-and-greet"],
  ["social_content", "Social media content"],
  ["other", "Other"],
] as const;
export const BRAND_CATEGORY_OPTIONS = [
  ["fashion", "Fashion"],
  ["beauty_grooming", "Beauty and grooming"],
  ["food_drink", "Food and drink"],
  ["tech_gadgets", "Tech and gadgets"],
  ["apps_gaming", "Apps and gaming"],
  ["finance", "Finance"],
  ["health_fitness", "Health and fitness"],
  ["other", "Other"],
] as const;
export const DELIVERABLE_OPTIONS = [
  ["instagram_reel", "Instagram reel"],
  ["instagram_story", "Instagram story"],
  ["instagram_post", "Instagram post"],
  ["youtube_video", "YouTube video"],
  ["event_appearance", "Event appearance"],
] as const;
export const USAGE_RIGHTS_OPTIONS = [
  ["organic", "Organic only"],
  ["1_month", "1 month paid ads"],
  ["3_months", "3 months"],
  ["6_months", "6 months"],
  ["12_months", "12 months"],
] as const;
export const TRAVEL_OPTIONS = [
  ["we_arrange", "We'll arrange travel and stay"],
  ["local", "Local, no travel needed"],
  ["discuss", "To be discussed"],
] as const;
