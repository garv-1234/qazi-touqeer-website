import { z } from "zod";
import { normalizePhone } from "./phone";

/** Today's date in India time, as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export const text = (min: number, max: number, message = "Please fill this in") =>
  z.string().trim().min(min, message).max(max, `Keep this under ${max} characters`);

export const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).optional();

export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid mobile number (add the country code if not Indian)",
      });
      return z.NEVER;
    }
    return phone;
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

export const futureDate = z
  .iso.date("Pick a date")
  .refine((d) => d >= todayIST(), "Pick today or a later date");

export const optionalFutureDate = futureDate.optional();

export const bookingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^QT-\d{4}-\d{4,}$/, "Booking IDs look like QT-2610-0042");

export const SOURCES = ["instagram", "youtube", "bigg_boss", "friend", "news", "other"] as const;
export const SOURCE_LABELS: Record<(typeof SOURCES)[number], string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  bigg_boss: "Bigg Boss",
  friend: "A friend",
  news: "News or press",
  other: "Other",
};

/** FR-B1: fields every booking form shares. */
export const commonSchema = z.object({
  name: text(2, 120, "Enter your full name"),
  phone: phoneSchema,
  email: emailSchema,
  city: text(2, 80, "Enter your city"),
  preferred_date: futureDate,
  backup_date: optionalFutureDate,
  source: z.enum(SOURCES, "Tell us how you heard of Qazi"),
  consent_policies: z.literal(true, "Please accept the Terms, Privacy and Refund policies"),
  consent_messages: z.literal(true, "Please agree to receive booking updates"),
});

/** Bot check sent with every public form (honeypot + time trap). */
export const botSchema = z.object({
  website: z.string().max(500).optional(), // must be empty; checked by the server's bot check, not here

  started_at: z.number().int().positive(),
});
export type BotFields = z.infer<typeof botSchema>;
