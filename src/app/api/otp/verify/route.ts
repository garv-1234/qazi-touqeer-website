import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OTP_TOKEN_TTL_SECONDS, otpCodeHash, phoneHash, signOtpToken } from "@/lib/server/crypto";
import { apiError, parseBody, serverError } from "@/lib/server/http";
import { otpVerifySchema } from "@/lib/validation";

/** POST /api/otp/verify — check a code; on success return a short-lived signed token. */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, otpVerifySchema);
  if (response) return response;

  try {
    const db = createAdminClient();
    const { data: rows, error } = await db.rpc("check_otp", {
      p_phone_hash: phoneHash(data.phone),
      p_purpose: data.purpose,
      p_code_hash: otpCodeHash(data.phone, data.code),
    });
    if (error) throw error;
    const r = (rows as { result: string; attempts_left: number }[] | null)?.[0];

    switch (r?.result) {
      case "ok":
        return NextResponse.json({
          token: signOtpToken(data.phone, data.purpose),
          phone: data.phone,
          expires_in: OTP_TOKEN_TTL_SECONDS,
        });
      case "invalid":
        return apiError(
          400,
          "otp_invalid",
          `That code isn't right. ${r.attempts_left} ${r.attempts_left === 1 ? "try" : "tries"} left.`,
          { attempts_left: r.attempts_left },
        );
      case "expired":
        return apiError(400, "otp_expired", "This code has expired. Please request a new one.");
      case "too_many":
        return apiError(429, "otp_locked", "Please request a new code.");
      default:
        return apiError(400, "otp_missing", "Please request a new code.");
    }
  } catch (e) {
    return serverError("otp/verify", e);
  }
}
