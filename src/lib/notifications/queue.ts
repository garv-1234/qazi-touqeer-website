import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Queues messages in message_log (status 'queued'). Step 4 adds the sender
 * that delivers them and the templates' text. Queueing never throws: a failed
 * message must not block a booking (NFR-7).
 */

/** Requester-facing templates (FR-N ids). */
export type RequesterTemplate =
  | "booking_submitted" // N1
  | "booking_waitlisted" // N1 (waitlist variant)
  | "payment_submitted" // N5
  | "booking_cancelled"; // N10

/** Team alerts. */
export type TeamTemplate =
  | "team_new_request" // N1 -> category owner
  | "team_payment_submitted" // N5 -> admins
  | "team_booking_cancelled" // N10 -> admins
  | "team_info_reply"; // requester answered an info request

type Channels = { whatsapp?: boolean; email?: boolean; sms?: boolean };

type BookingRef = {
  id: string;
  category: "podcast" | "fan_meetup" | "misc_event";
  email: string;
  phone: string;
};

type Row = { booking_id: string; channel: "whatsapp" | "email" | "sms"; template: string; recipient: string };

export async function queueMessages(
  db: SupabaseClient,
  booking: BookingRef,
  requesterTemplate: RequesterTemplate | null,
  teamTemplate: TeamTemplate | null,
): Promise<void> {
  try {
    const rows: Row[] = [];

    if (requesterTemplate) {
      const { data } = await db.from("settings").select("value").eq("key", "notifications").maybeSingle();
      const channels: Channels = data?.value ?? { email: true, sms: true };
      const base = { booking_id: booking.id, template: requesterTemplate };
      if (channels.email) rows.push({ ...base, channel: "email", recipient: booking.email });
      // WhatsApp when switched on; until then SMS carries the message (FR-N).
      if (channels.whatsapp) rows.push({ ...base, channel: "whatsapp", recipient: booking.phone });
      else if (channels.sms) rows.push({ ...base, channel: "sms", recipient: booking.phone });
    }

    if (teamTemplate) {
      const adminsOnly = teamTemplate !== "team_new_request" && teamTemplate !== "team_info_reply";
      const { data: staff } = await db
        .from("staff_profiles")
        .select("email, role, categories")
        .eq("active", true)
        .in("role", ["super_admin", "admin", "category_manager"]);
      for (const s of staff ?? []) {
        const isAdmin = s.role === "super_admin" || s.role === "admin";
        const ownsCategory = s.role === "category_manager" && (s.categories ?? []).includes(booking.category);
        if (isAdmin || (!adminsOnly && ownsCategory)) {
          rows.push({ booking_id: booking.id, channel: "email", template: teamTemplate, recipient: s.email });
        }
      }
    }

    if (rows.length === 0) return;
    const { error } = await db.from("message_log").insert(rows);
    if (error) console.error("queueMessages: insert failed", error.message);
  } catch (e) {
    console.error("queueMessages failed", e);
  }
}
