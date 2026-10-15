import "server-only";
import type { NextResponse } from "next/server";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOtpToken, type OtpToken } from "@/lib/server/crypto";
import { apiError, parseBody } from "@/lib/server/http";
import type { trackRequestSchema } from "@/lib/validation";
import { findBookingForPhone, type BookingRow } from "./server";

type TrackContext<T> = {
  data: T;
  db: ReturnType<typeof createAdminClient>;
  token: OtpToken;
  booking: BookingRow;
};

/**
 * Shared start of every /api/track* route: validate the body, check the
 * track OTP token, and load the booking only if it belongs to that phone.
 */
export async function openTrackRequest<S extends z.ZodType<z.infer<typeof trackRequestSchema>>>(
  req: Request,
  schema: S,
): Promise<{ ctx: TrackContext<z.infer<S>>; response?: never } | { ctx?: never; response: NextResponse }> {
  const { data, response } = await parseBody(req, schema);
  if (response) return { response };

  const token = verifyOtpToken(data.token, "track");
  if (!token) return { response: apiError(401, "otp_required", "Please verify your phone number again.") };

  const db = createAdminClient();
  const booking = await findBookingForPhone(db, data.booking_code, token.phone);
  if (!booking) {
    return {
      response: apiError(404, "not_found", "We couldn't find a booking with that ID for this phone number."),
    };
  }
  return { ctx: { data, db, token, booking } };
}
