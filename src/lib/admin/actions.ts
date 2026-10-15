// Booking actions (docs/specs/admin-dashboard.md, "Actions").
// Which buttons show is decided here; public.staff_action() enforces the same
// rules in the database (supabase/migrations/20261019000000_admin_core.sql).
import type { BookingStatus } from "@/lib/booking/status";
import type { StaffRole } from "./roles";

export const ACTIONS = [
  "assign",
  "start_review",
  "request_info",
  "flag_client",
  "approve",
  "decline",
  "mark_paid",
  "reject_payment",
  "extend_deadline",
  "release",
  "offer_seat",
  "complete",
  "cancel",
  "client_decide",
  "add_note",
] as const;
export type ActionName = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<ActionName, string> = {
  assign: "Assign",
  start_review: "Start review",
  request_info: "Request info",
  flag_client: "Flag for client sign-off",
  approve: "Approve",
  decline: "Decline",
  mark_paid: "Mark paid",
  reject_payment: "Reject payment",
  extend_deadline: "Extend deadline",
  release: "Release slot",
  offer_seat: "Offer seat",
  complete: "Mark completed",
  cancel: "Cancel",
  client_decide: "Client approve or decline",
  add_note: "Add note",
};

export const DECLINE_REASONS = [
  ["dates_unavailable", "Not available on these dates"],
  ["below_minimum", "Budget below our minimum"],
  ["not_a_fit", "Not the right fit"],
  ["restricted", "Restricted product or category"],
  ["incomplete", "Incomplete or unverifiable details"],
  ["other", "Other"],
] as const;

export const REJECT_PAYMENT_REASONS = [
  ["utr_not_found", "UTR not found in our account"],
  ["amount_mismatch", "Amount doesn't match"],
  ["wrong_account", "Paid to the wrong account"],
  ["bad_screenshot", "Screenshot unclear or invalid"],
  ["other", "Other"],
] as const;

const FINAL: BookingStatus[] = ["completed", "declined", "expired", "cancelled"];

export type ActionContext = {
  status: BookingStatus;
  role: StaffRole;
  overdue: boolean;
  deadlineExtended: boolean;
  needsClient: boolean;
  clientDecision: "approved" | "declined" | null;
  paymentDetailsReady: boolean;
  /** Meetups only. */
  seatsLeft: number | null;
  partySize: number;
  /** Event date (or preferred date) has passed. */
  datePassed: boolean;
  /** Latest submitted payment is below the advance. */
  paymentShort: boolean;
};

export type AvailableAction = { action: ActionName; disabledReason?: string };

/** Buttons for this booking and role, in display order. */
export function availableActions(c: ActionContext): AvailableAction[] {
  const out: AvailableAction[] = [];
  const staffActor = c.role === "super_admin" || c.role === "admin" || c.role === "category_manager";
  const senior = c.role === "super_admin" || c.role === "admin";
  const open = !FINAL.includes(c.status);
  const add = (action: ActionName, when: boolean, disabledReason?: string) => {
    if (when) out.push(disabledReason ? { action, disabledReason } : { action });
  };

  if (staffActor) {
    add("start_review", c.status === "submitted");
    add(
      "approve",
      c.status === "in_review",
      c.needsClient && c.clientDecision !== "approved"
        ? c.clientDecision === "declined"
          ? "The client declined this request."
          : "Waiting for client sign-off."
        : !c.paymentDetailsReady
          ? "Add payment details in Settings first."
          : undefined,
    );
    add("request_info", c.status === "in_review");
    add(
      "flag_client",
      (c.status === "in_review" || c.status === "info_requested") && !(c.needsClient && c.clientDecision === null),
    );
    add(
      "offer_seat",
      c.status === "waitlisted",
      c.seatsLeft !== null && c.seatsLeft < c.partySize ? "No seats left for this meetup. Keep it on the waitlist or decline." : undefined,
    );
  }
  if (senior) {
    add(
      "mark_paid",
      c.status === "payment_submitted",
      c.paymentShort ? "Amount is short. Reject the payment with the reason 'Amount doesn't match'." : undefined,
    );
    add("reject_payment", c.status === "payment_submitted");
  }
  if (staffActor) {
    add("extend_deadline", c.status === "payment_pending" && !c.deadlineExtended);
    add("release", c.status === "payment_pending" && c.overdue);
    add("complete", c.status === "confirmed" && c.datePassed);
    add(
      "decline",
      c.status === "submitted" || c.status === "waitlisted" || c.status === "in_review" || c.status === "info_requested",
    );
    add(
      "cancel",
      open && (senior || (c.status !== "payment_submitted" && c.status !== "confirmed")),
    );
    add("assign", open);
  }
  if (c.role === "client_approver" || c.role === "super_admin") {
    add("client_decide", c.needsClient && c.clientDecision === null);
  }
  return out;
}

/** Default advance (spec): percent of budget rounded to ₹100, or ticket × people × percent. */
export function defaultAdvance(opts: {
  advanceType: "percent" | "fixed" | "ticket_price";
  advanceValue: number;
  budget: number | null;
  ticketPrice: number | null;
  partySize: number;
}): number | null {
  const { advanceType, advanceValue, budget, ticketPrice, partySize } = opts;
  if (advanceType === "fixed") return advanceValue > 0 ? Math.round(advanceValue) : null;
  if (advanceType === "ticket_price") {
    if (ticketPrice === null) return null;
    const v = Math.round((ticketPrice * partySize * advanceValue) / 100);
    return v > 0 ? v : null;
  }
  if (budget === null || budget <= 0) return null;
  const v = Math.round((budget * advanceValue) / 100 / 100) * 100;
  return v > 0 ? v : null;
}

/** Default deadline: now + the category's hold window, kept within 1 hour .. 14 days. */
export function defaultDeadline(now: number, holdHours: number): string {
  const h = Math.min(Math.max(holdHours, 1), 14 * 24);
  return new Date(now + h * 3600e3).toISOString();
}
