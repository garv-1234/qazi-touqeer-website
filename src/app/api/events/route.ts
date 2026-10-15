import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicEvent } from "@/lib/booking/events";
import { serverError } from "@/lib/server/http";

/** GET /api/events — published upcoming meetups with live seats left (FR-W5). */
export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("published_events");
    if (error) throw error;
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    const events: PublicEvent[] = (data ?? []).map((e: PublicEvent) => ({
      ...e,
      ticket_price: Number(e.ticket_price),
      // From the DB (20261018000000_meetup_cutoff.sql); computed the same way if
      // that migration hasn't been applied yet.
      bookings_open: typeof e.bookings_open === "boolean" ? e.bookings_open : new Date(e.starts_at).getTime() > cutoff,
    }));
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError("events", e);
  }
}
