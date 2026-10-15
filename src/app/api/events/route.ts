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
    const events: PublicEvent[] = (data ?? []).map((e: PublicEvent) => ({
      ...e,
      ticket_price: Number(e.ticket_price),
    }));
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("events", e);
    return serverError();
  }
}
