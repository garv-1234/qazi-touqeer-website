// Pipeline flag badges (docs/specs/admin-dashboard.md, "Flag badges").

export type FlagCode =
  | "overdue"
  | "below_minimum"
  | "needs_client"
  | "client_approved"
  | "client_declined"
  | "restricted"
  | "info_requested"
  | "replied"
  | "unassigned"
  | "event_passed";

export const FLAG_LABELS: Record<FlagCode, string> = {
  overdue: "Overdue",
  below_minimum: "Below minimum",
  needs_client: "Needs client sign-off",
  client_approved: "Client approved",
  client_declined: "Client declined",
  restricted: "Restricted category",
  info_requested: "Info requested",
  replied: "Replied",
  unassigned: "Unassigned",
  event_passed: "Event passed",
};

/** Flags offered as pipeline filters. */
export const FILTER_FLAGS: FlagCode[] = ["overdue", "needs_client", "below_minimum", "restricted"];

// Restricted categories (Decisions: betting, alcohol, tobacco, unproven health claims).
const RESTRICTED_WORDS = [
  /\bbet(s|ting)?\b/i, /\bgambl/i, /\bcasino/i, /\bfantasy (cricket|sports?|league)\b/i, /\brummy\b/i, /\bpoker\b/i,
  /\balcohol/i, /\bliquor/i, /\bbeer\b/i, /\bwhisk(e)?y\b/i, /\bvodka\b/i, /\brum\b/i, /\bwine\b/i, /\bbrewer/i,
  /\btobacco/i, /\bcigar/i, /\bvape|vaping\b/i, /\bhookah\b/i, /\bgutkha\b/i, /\bpan masala\b/i,
  /\bweight[- ]loss\b/i, /\bfat burn/i, /\bmiracle\b/i, /\bcure[sd]?\b/i, /\bfairness cream\b/i, /\bhealth claims?\b/i,
];

/**
 * Brand collaboration with a restricted category, or those words in the brand
 * or notes (spec). Brand categories in the form never include them, so the
 * words are what catch it.
 */
export function isRestricted(details: Record<string, unknown>): boolean {
  const text = [details.brand, details.notes, details.event_type_other, details.event_name]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  return RESTRICTED_WORDS.some((re) => re.test(text));
}
