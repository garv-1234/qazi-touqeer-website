import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOOKING_FILES_BUCKET, findBookingForPhone, uploadFolder } from "@/lib/booking/server";
import { verifyOtpToken } from "@/lib/server/crypto";
import { apiError, parseBody, serverError } from "@/lib/server/http";
import { uploadRequestSchema } from "@/lib/validation";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * POST /api/uploads — signed upload URL for a brief (needs a submit token) or
 * a payment screenshot (needs a track token and a Payment pending booking).
 * The private bucket itself also enforces type and 10 MB size.
 */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, uploadRequestSchema);
  if (response) return response;

  const token = verifyOtpToken(data.token, data.kind === "brief" ? "submit" : "track");
  if (!token) return apiError(401, "otp_required", "Please verify your phone number again.");

  try {
    const db = createAdminClient();

    if (data.kind === "payment_screenshot") {
      const booking = await findBookingForPhone(db, data.booking_code!, token.phone);
      if (!booking) return apiError(404, "not_found", "We couldn't find that booking.");
      if (booking.status !== "payment_pending") {
        return apiError(409, "rule", "This booking is not waiting for a payment.");
      }
    }

    const path = `${uploadFolder(data.kind, token.phone)}${randomUUID()}.${EXTENSIONS[data.mime_type]}`;
    const { data: signed, error } = await db.storage.from(BOOKING_FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw error ?? new Error("No signed URL");

    return NextResponse.json({ bucket: BOOKING_FILES_BUCKET, path: signed.path, upload_token: signed.token });
  } catch (e) {
    console.error("uploads", e);
    return serverError();
  }
}
