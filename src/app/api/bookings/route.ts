import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUpload, type VerifiedUpload } from "@/lib/booking/server";
import { OPEN_STATUSES, type BookingStatus } from "@/lib/booking/status";
import { queueMessages } from "@/lib/notifications/queue";
import { verifyOtpToken } from "@/lib/server/crypto";
import {
  apiError,
  botRejected,
  clientIpHash,
  failsBotCheck,
  isUniqueViolation,
  parseBody,
  ruleMessage,
  serverError,
} from "@/lib/server/http";
import { createBookingRequestSchema, type BookingInput } from "@/lib/validation";

const SUBMISSIONS_PER_IP_PER_HOUR = 10;

/** POST /api/bookings — create a booking after OTP (FR-B5..B10). */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, createBookingRequestSchema);
  if (response) return response;
  if (failsBotCheck(data.bot)) return botRejected();

  const { booking } = data;
  const token = verifyOtpToken(data.token, "submit");
  if (!token || token.phone !== booking.phone) {
    return apiError(401, "otp_required", "Please verify your phone number again.");
  }

  try {
    const db = createAdminClient();
    const ipHash = clientIpHash(req);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= SUBMISSIONS_PER_IP_PER_HOUR) {
      return apiError(429, "rate_limited", "Too many requests from this network. Please try again in an hour.");
    }

    const { data: site } = await db.from("settings").select("value").eq("key", "site").maybeSingle();
    const consentVersion: string = site?.value?.consent_version ?? "unversioned";

    const mapped = await mapBooking(db, booking);
    if ("error" in mapped) return apiError(400, "invalid", mapped.error, { fields: mapped.fields });

    const { data: rows, error } = await db.rpc("create_booking", {
      p: {
        category: booking.category,
        name: booking.name,
        phone: booking.phone,
        phone_verified_at: new Date(token.verifiedAt).toISOString(),
        email: booking.email,
        city: booking.city,
        preferred_date: booking.preferred_date ?? null,
        backup_date: booking.backup_date ?? null,
        source: booking.source,
        consent_version: consentVersion,
        ip_hash: ipHash,
        ...mapped,
      },
    });

    if (error) {
      if (isUniqueViolation(error, "bookings_one_open_per_phone_category")) {
        const { data: existing } = await db
          .from("bookings")
          .select("booking_code, status")
          .eq("phone", booking.phone)
          .eq("category", booking.category)
          .in("status", OPEN_STATUSES as BookingStatus[])
          .maybeSingle();
        return apiError(409, "duplicate", "You already have an open request in this category.", {
          booking_code: existing?.booking_code ?? null,
        });
      }
      const rule = ruleMessage(error);
      if (rule) return apiError(409, "rule", rule);
      throw error;
    }

    const created = (rows as { id: string; booking_code: string; status: BookingStatus }[])[0];
    const waitlisted = created.status === "waitlisted";
    await queueMessages(
      db,
      { id: created.id, category: booking.category, email: booking.email, phone: booking.phone },
      waitlisted ? "booking_waitlisted" : "booking_submitted",
      "team_new_request",
    );

    return NextResponse.json(
      { booking_code: created.booking_code, status: created.status, waitlisted },
      { status: 201 },
    );
  } catch (e) {
    console.error("bookings", e);
    return serverError();
  }
}

/** Category-specific columns for create_booking. */
async function mapBooking(
  db: ReturnType<typeof createAdminClient>,
  booking: BookingInput,
): Promise<
  | { details: object; budget: number | null; event_id?: string; party_size?: number; attachments: VerifiedUpload[] }
  | { error: string; fields: Record<string, string> }
> {
  switch (booking.category) {
    case "podcast": {
      const d = booking.details;
      return {
        details: d,
        budget: d.fee_type === "paid" ? (d.fee_offered ?? null) : null,
        attachments: [],
      };
    }
    case "fan_meetup": {
      const { event_id, party_size, ...details } = booking.details;
      return { details, budget: null, event_id, party_size, attachments: [] };
    }
    case "misc_event": {
      const { brief_path, ...details } = booking.details;
      const attachments: (VerifiedUpload & { kind: "brief" })[] = [];
      if (brief_path) {
        const file = await verifyUpload(db, brief_path, "brief", booking.phone);
        if (!file) {
          return {
            error: "We couldn't find your uploaded brief. Please upload it again.",
            fields: { "details.brief_path": "Upload the file again" },
          };
        }
        attachments.push({ ...file, kind: "brief" });
      }
      return { details, budget: details.budget, attachments };
    }
  }
}
