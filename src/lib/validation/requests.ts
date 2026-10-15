import { z } from "zod";
import { botSchema, bookingCodeSchema, optional, phoneSchema, textArea, todayIST } from "./common";

export const OTP_PURPOSES = ["submit", "track"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const otpSendSchema = z
  .object({
    phone: phoneSchema,
    purpose: z.enum(OTP_PURPOSES),
    booking_code: bookingCodeSchema.optional(),
    bot: botSchema,
  })
  .refine((d) => d.purpose !== "track" || d.booking_code, {
    path: ["booking_code"],
    message: "Enter your Booking ID",
  });

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(OTP_PURPOSES),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// ---------------------------------------------------------------------
// Uploads (FR-B4 brief, FR-P3 payment screenshot)
// ---------------------------------------------------------------------
export const UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_KINDS = ["brief", "payment_screenshot"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const uploadRequestSchema = z
  .object({
    token: z.string().min(10),
    kind: z.enum(UPLOAD_KINDS),
    mime_type: z.enum(UPLOAD_MIME_TYPES, "Upload a PDF, JPEG, PNG or WEBP file"),
    size_bytes: z.number().int().min(1).max(UPLOAD_MAX_BYTES, "Files must be 10 MB or smaller"),
    booking_code: bookingCodeSchema.optional(),
  })
  .refine((d) => d.kind !== "payment_screenshot" || d.booking_code, {
    path: ["booking_code"],
    message: "Booking ID is required for a payment screenshot",
  });

// ---------------------------------------------------------------------
// Track My Booking (FR-W7, FR-P3, FR-B11)
// ---------------------------------------------------------------------
export const trackRequestSchema = z.object({
  token: z.string().min(10),
  booking_code: bookingCodeSchema,
});

export const PAYMENT_METHODS = ["upi", "bank_transfer"] as const;

export const paymentSubmitSchema = trackRequestSchema
  .extend({
    method: z.enum(PAYMENT_METHODS, "Pick UPI or bank transfer"),
    utr: z.string().trim().toUpperCase(),
    amount_paid: z.number("Enter the amount you paid").positive("Enter the amount you paid").max(100_000_000),
    paid_on: z
      .iso.date("Enter the payment date")
      .refine((d) => d <= todayIST(), "The payment date can't be in the future"),
    screenshot_path: z.string().max(300).optional(),
  })
  .refine((d) => (d.method === "upi" ? /^\d{12}$/.test(d.utr) : /^[A-Z0-9]{12,22}$/.test(d.utr)), {
    path: ["utr"],
    message: "Enter the 12-digit UPI reference (UTR), or the bank transfer reference",
  });

export const cancelRequestSchema = trackRequestSchema.extend({
  reason: optional(textArea(0, 500, "Keep this under 500 characters.", "Keep this under 500 characters.")),
});

export const replyRequestSchema = trackRequestSchema.extend({
  message: textArea(2, 3000, "Write your reply", "Keep this under 3,000 characters."),
});
