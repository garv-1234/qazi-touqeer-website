/**
 * Booking statuses and allowed moves.
 * MUST stay in sync with public.is_valid_transition() in
 * supabase/migrations/20261015000000_init.sql — the database is the final
 * authority; this copy lets the UI show only valid actions.
 */
export const BOOKING_STATUSES = [
  "submitted",
  "waitlisted",
  "in_review",
  "info_requested",
  "payment_pending",
  "payment_submitted",
  "confirmed",
  "completed",
  "declined",
  "expired",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  submitted: ["in_review", "declined", "cancelled"],
  waitlisted: ["submitted", "declined", "cancelled"],
  in_review: ["info_requested", "payment_pending", "declined", "cancelled"],
  info_requested: ["in_review", "declined", "cancelled"],
  payment_pending: ["payment_submitted", "expired", "cancelled"],
  payment_submitted: ["confirmed", "payment_pending", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  declined: [],
  expired: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return TRANSITIONS[from].includes(to);
}

/**
 * The subset of moves a requester (not staff) may make from Track My Booking.
 * Mirror of public.is_requester_transition() in
 * supabase/migrations/20261017000000_booking_engine.sql.
 */
export const REQUESTER_TRANSITIONS: Partial<Record<BookingStatus, readonly BookingStatus[]>> = {
  submitted: ["cancelled"],
  waitlisted: ["cancelled"],
  in_review: ["cancelled"],
  info_requested: ["in_review", "cancelled"],
  payment_pending: ["payment_submitted", "cancelled"],
};

export function requesterCanTransition(from: BookingStatus, to: BookingStatus) {
  return REQUESTER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Labels shown to staff and requesters. */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  submitted: "Submitted",
  waitlisted: "Waitlisted",
  in_review: "In review",
  info_requested: "Info requested",
  payment_pending: "Payment pending",
  payment_submitted: "Payment submitted",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const OPEN_STATUSES: readonly BookingStatus[] = [
  "submitted",
  "waitlisted",
  "in_review",
  "info_requested",
  "payment_pending",
  "payment_submitted",
];
