import { NextResponse } from "next/server";
import { buildTrackView } from "@/lib/booking/server";
import { openTrackRequest } from "@/lib/booking/track-route";
import { serverError } from "@/lib/server/http";
import { trackRequestSchema } from "@/lib/validation";

/** POST /api/track — status, next step and payment details for a Booking ID (FR-W7). */
export async function POST(req: Request) {
  try {
    const { ctx, response } = await openTrackRequest(req, trackRequestSchema);
    if (response) return response;
    return NextResponse.json({ booking: await buildTrackView(ctx.db, ctx.booking) });
  } catch (e) {
    return serverError("track", e);
  }
}
