import { z } from "zod";
import { normalizePhone } from "./phone";

// ---------------------------------------------------------------------
// Dates (India time)
// ---------------------------------------------------------------------

/** Today's date in India time, as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const shiftDate = (ymd: string, days: number, years = 0) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const addDaysIST = (days: number) => shiftDate(todayIST(), days);
/** Last allowed booking date: 12 months from today. */
export const maxBookingDateIST = () => shiftDate(todayIST(), 0, 1);

// ---------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------

/** Trim and collapse repeated spaces (single-line fields also lose line breaks). */
export const cleanText = (s: string, multiline = false) =>
  multiline
    ? s.trim().replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
    : s.trim().replace(/\s+/g, " ");

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "") || v === null ? undefined : v;

/** Wraps a schema so a blank or missing value is allowed. */
export const optional = <S extends z.ZodType>(schema: S) => z.preprocess(blankToUndefined, schema.optional());

/** Single-line text, cleaned, with one message for every problem (the spec's message). */
export const textField = (min: number, max: number, message: string) =>
  z.string(message).transform((s) => cleanText(s)).pipe(z.string().min(min, message).max(max, message));

/** Multi-line text; `minMessage`/`maxMessage` per the spec. */
export const textArea = (min: number, max: number, minMessage: string, maxMessage: string) =>
  z
    .string(minMessage)
    .transform((s) => cleanText(s, true))
    .pipe(z.string().min(min, minMessage).max(max, maxMessage));

/** Names: 2–80 characters; letters (any script), spaces, . ' - only. */
export const personName = (message: string) =>
  textField(2, 80, message).pipe(z.string().regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, message));

/** https:// link, max 300 characters. */
export const httpsUrl = (message = "Enter a full link starting with https://") =>
  z
    .string(message)
    .trim()
    .max(300, message)
    .regex(/^https:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i, message)
    .pipe(z.url({ protocol: /^https$/, error: message }));

/** Whole rupees, ₹1 to ₹1,00,00,000. */
export const rupees = (message: string) => z.number(message).int(message).min(1, message).max(10_000_000, message);

/** Phone typed by a visitor, normalised to E.164. */
export const phoneField = (message: string) =>
  z.string(message).transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return phone;
  });

export const phoneSchema = phoneField("Enter a valid mobile number (add the country code if not Indian)");

/** YYYY-MM-DD at least `minDays` from today (IST) and within 12 months. */
export const bookingDate = (minDays: number, message: string) =>
  z
    .string(message)
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((d) => d >= addDaysIST(minDays), message)
    .refine((d) => d <= maxBookingDateIST(), "Choose a date within the next 12 months.");

export const bookingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^QT-\d{4}-\d{4,}$/, "Booking IDs look like QT-2610-0042");

/** Minimum time between a form appearing and its first request (bot time trap). */
export const BOT_MIN_FILL_MS = 3000;

/** Bot check sent with every public form (honeypot + time trap). */
export const botSchema = z.object({
  website: z.string().max(500).optional(), // must be empty; checked by the server's bot check, not here
  started_at: z.number().int().positive(),
});
export type BotFields = z.infer<typeof botSchema>;
