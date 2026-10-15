import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findBookingForPhone } from "@/lib/booking/server";
import { generateOtp, otpCodeHash, phoneHash } from "@/lib/server/crypto";
import { apiError, botRejected, clientIpHash, failsBotCheck, parseBody, serverError } from "@/lib/server/http";
import { getSmsProvider, isDevSms } from "@/lib/sms";
import { otpSendSchema } from "@/lib/validation";

const OTP_TTL_SECONDS = 600;

/** POST /api/otp/send — send a 6-digit code to a phone (FR-B5, FR-B8). */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, otpSendSchema);
  if (response) return response;
  if (failsBotCheck(data.bot)) return botRejected();

  const sms = getSmsProvider();
  if (!sms) {
    return apiError(503, "sms_unavailable", "Phone verification isn't available right now. Please try again later.");
  }

  try {
    const db = createAdminClient();
    const sent = { ok: true, expires_in: OTP_TTL_SECONDS };

    // Track: only text numbers that own the Booking ID, but answer the same
    // way either way so the form can't be used to probe bookings.
    if (data.purpose === "track") {
      const booking = await findBookingForPhone(db, data.booking_code!, data.phone);
      if (!booking) return NextResponse.json(sent);
    }

    const code = generateOtp();
    const { data: result, error } = await db.rpc("issue_otp", {
      p_phone_hash: phoneHash(data.phone),
      p_purpose: data.purpose,
      p_code_hash: otpCodeHash(data.phone, code),
      p_ip_hash: clientIpHash(req),
      p_ttl_seconds: OTP_TTL_SECONDS,
    });
    if (error) throw error;
    if (result === "phone_limit") {
      return apiError(429, "rate_limited", "Too many codes were sent to this number. Please try again in an hour.");
    }
    if (result === "ip_limit") {
      return apiError(429, "rate_limited", "Too many codes were requested from this network. Please try again later.");
    }

    const log = { channel: "sms", template: `otp_${data.purpose}`, recipient: data.phone, attempts: 1 };
    try {
      const { messageId } = await sms.sendOtp(data.phone, code);
      await db.from("message_log").insert({ ...log, status: "sent", provider_message_id: messageId });
    } catch (e) {
      await db.from("message_log").insert({ ...log, status: "failed", error: String(e).slice(0, 500) });
      return apiError(502, "sms_failed", "We couldn't send the code. Please check the number and try again.");
    }

    // In local development there is no SMS: show the code on screen.
    return NextResponse.json(isDevSms() ? { ...sent, dev_code: code } : sent);
  } catch (e) {
    console.error("otp/send", e);
    return serverError();
  }
}
