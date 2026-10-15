import { NextResponse } from "next/server";
import { buildTrackView, findBookingForPhone, verifyUpload } from "@/lib/booking/server";
import { openTrackRequest } from "@/lib/booking/track-route";
import { queueMessages } from "@/lib/notifications/queue";
import { apiError, isUniqueViolation, ruleMessage, serverError } from "@/lib/server/http";
import { paymentSubmitSchema } from "@/lib/validation";

/** POST /api/track/payment — requester submits the UTR (FR-P3, FR-P4). */
export async function POST(req: Request) {
  try {
    const { ctx, response } = await openTrackRequest(req, paymentSubmitSchema);
    if (response) return response;
    const { data, db, booking, token } = ctx;

    let screenshot = null;
    if (data.screenshot_path) {
      screenshot = await verifyUpload(db, data.screenshot_path, "payment_screenshot", token.phone);
      if (!screenshot) {
        return apiError(400, "invalid", "We couldn't find your screenshot. Please upload it again.", {
          fields: { screenshot_path: "Upload the file again" },
        });
      }
    }

    const { error } = await db.rpc("submit_payment", {
      p_booking_id: booking.id,
      p_method: data.method,
      p_amount_paid: data.amount_paid,
      p_utr: data.utr,
      p_paid_on: data.paid_on,
      p_screenshot: screenshot,
    });
    if (error) {
      if (isUniqueViolation(error, "payments_utr_unique")) {
        return apiError(409, "utr_used", "This payment reference (UTR) has already been used.", {
          fields: { utr: "Already used on another booking" },
        });
      }
      const rule = ruleMessage(error);
      if (rule) return apiError(409, "rule", rule);
      throw error;
    }

    await queueMessages(db, booking, "payment_submitted", "team_payment_submitted");
    const updated = await findBookingForPhone(db, booking.booking_code, token.phone);
    return NextResponse.json({ booking: await buildTrackView(db, updated!) });
  } catch (e) {
    console.error("track/payment", e);
    return serverError();
  }
}
