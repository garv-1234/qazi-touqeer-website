import { NextResponse } from "next/server";
import { buildTrackView, findBookingForPhone } from "@/lib/booking/server";
import { openTrackRequest } from "@/lib/booking/track-route";
import { queueMessages } from "@/lib/notifications/queue";
import { apiError, ruleMessage, serverError } from "@/lib/server/http";
import { replyRequestSchema } from "@/lib/validation";

/** POST /api/track/reply — requester answers an info request (Info requested -> In review). */
export async function POST(req: Request) {
  try {
    const { ctx, response } = await openTrackRequest(req, replyRequestSchema);
    if (response) return response;
    const { data, db, booking, token } = ctx;

    const { error } = await db.rpc("requester_reply", { p_booking_id: booking.id, p_body: data.message });
    if (error) {
      const rule = ruleMessage(error);
      if (rule) return apiError(409, "rule", rule);
      throw error;
    }

    await queueMessages(db, booking, null, "team_info_reply");
    const updated = await findBookingForPhone(db, booking.booking_code, token.phone);
    return NextResponse.json({ booking: await buildTrackView(db, updated!) });
  } catch (e) {
    console.error("track/reply", e);
    return serverError();
  }
}
