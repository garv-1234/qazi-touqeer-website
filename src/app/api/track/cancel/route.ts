import { NextResponse } from "next/server";
import { buildTrackView, findBookingForPhone } from "@/lib/booking/server";
import { openTrackRequest } from "@/lib/booking/track-route";
import { queueMessages } from "@/lib/notifications/queue";
import { apiError, serverError } from "@/lib/server/http";
import { cancelRequestSchema } from "@/lib/validation";

/** POST /api/track/cancel — requester cancels before paying (FR-B11). */
export async function POST(req: Request) {
  try {
    const { ctx, response } = await openTrackRequest(req, cancelRequestSchema);
    if (response) return response;
    const { data, db, booking, token } = ctx;

    // The database refuses requester cancellation once a payment is submitted.
    const { error } = await db.rpc("transition_booking", {
      p_booking_id: booking.id,
      p_to: "cancelled",
      p_actor_type: "requester",
      p_reason: data.reason ? `Cancelled by requester: ${data.reason}` : "Cancelled by requester",
    });
    if (error) {
      if (error.code === "23514") {
        return apiError(
          409,
          "rule",
          "This booking can't be cancelled online any more. Please contact us; refunds follow the refund policy.",
        );
      }
      throw error;
    }

    await queueMessages(db, booking, "booking_cancelled", "team_booking_cancelled");
    const updated = await findBookingForPhone(db, booking.booking_code, token.phone);
    return NextResponse.json({ booking: await buildTrackView(db, updated!) });
  } catch (e) {
    return serverError("track/cancel", e);
  }
}
