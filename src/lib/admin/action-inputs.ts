// Server-side shapes for each action's inputs. The database checks the rules
// again (statuses, limits, seats, sign-off), so these only guard the shape.
import { z } from "zod";
import { ACTIONS, DECLINE_REASONS, REJECT_PAYMENT_REASONS } from "./actions";

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max.toLocaleString("en-IN")} characters.`).optional();
const keys = <T extends readonly (readonly [string, string])[]>(o: T) =>
  o.map(([k]) => k) as unknown as [T[number][0], ...T[number][0][]];
const iso = z.iso.datetime({ offset: true, error: "Choose a date and time." });
const OTHER_NEEDS_MESSAGE = 'Add a message for "Other".';

export const ACTION_INPUTS = {
  assign: z.object({ owner_id: z.uuid("Choose a staff member.") }),
  start_review: z.object({}),
  request_info: z.object({
    question: z.string().trim().min(10, "Write at least 10 characters.").max(1000, "Keep this under 1,000 characters."),
  }),
  flag_client: z.object({ note: optionalText(1000) }),
  approve: z.object({
    advance_amount: z.number("Enter the advance in rupees.").int("Use whole rupees.").min(1, "Enter the advance in rupees.").max(100_000_000),
    payment_deadline: iso,
    message: optionalText(1000),
  }),
  decline: z
    .object({ reason: z.enum(keys(DECLINE_REASONS), "Choose a reason."), message: optionalText(1000) })
    .refine((d) => d.reason !== "other" || !!d.message, { path: ["message"], message: OTHER_NEEDS_MESSAGE }),
  mark_paid: z.object({
    found_utr: z.literal(true, "Tick this to confirm."),
    amount_ok: z.literal(true, "Tick this to confirm."),
  }),
  reject_payment: z
    .object({
      reason: z.enum(keys(REJECT_PAYMENT_REASONS), "Choose a reason."),
      message: optionalText(1000),
      extend_24h: z.boolean().optional(),
    })
    .refine((d) => d.reason !== "other" || !!d.message, { path: ["message"], message: OTHER_NEEDS_MESSAGE }),
  extend_deadline: z.object({ payment_deadline: iso }),
  release: z.object({ message: optionalText(500) }),
  offer_seat: z.object({}),
  complete: z.object({}),
  cancel: z
    .object({
      reason: z.string().trim().min(2, "Give a reason for cancelling.").max(500),
      refund: z.enum(["full", "partial", "none"]).optional(),
      refund_amount: z.number().int().min(1).optional(),
    })
    .refine((d) => d.refund !== "partial" || !!d.refund_amount, {
      path: ["refund_amount"],
      message: "Enter the partial refund amount.",
    }),
  client_decide: z.object({ decision: z.enum(["approved", "declined"]), comment: optionalText(1000) }),
  add_note: z.object({ body: z.string().trim().min(1, "Write a note.").max(5000, "Keep this under 5,000 characters.") }),
} satisfies Record<(typeof ACTIONS)[number], z.ZodType>;

export const actionRequestSchema = z.object({
  action: z.enum(ACTIONS),
  input: z.record(z.string(), z.unknown()).default({}),
  expected: z.string().max(64).nullable().optional(),
});
