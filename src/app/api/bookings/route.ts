import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUpload } from "@/lib/booking/server";
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
import { createBookingRequestSchema, fieldErrors, parseBooking, type BookingInput } from "@/lib/validation";

const SUBMISSIONS_PER_IP_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

/** POST /api/bookings — create a booking after OTP (FR-B5..B10, docs/specs/booking-forms.md). */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, createBookingRequestSchema);
  if (response) return response;
  if (failsBotCheck(data.bot)) return botRejected();

  const parsed = parseBooking(data.booking, "send");
  if (!parsed.success) {
    return apiError(400, "invalid", "Please check the highlighted fields.", { fields: fieldErrors(parsed.error) });
  }
  const booking = parsed.data;

  const token = verifyOtpToken(data.token, "submit");
  if (!token || token.phone !== booking.phone) {
    return apiError(401, "otp_required", "For your security, please verify your number again.");
  }

  try {
    const db = createAdminClient();
    const ipHash = clientIpHash(req);

    const { data: recent, count, error: countError } = await db
      .from("bookings")
      .select("created_at", { count: "exact" })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - HOUR_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(1);
    if (countError) throw countError;
    if ((count ?? 0) >= SUBMISSIONS_PER_IP_PER_HOUR) {
      const oldest = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : Date.now();
      const retryAfter = Math.max(60, Math.ceil((oldest + HOUR_MS - Date.now()) / 1000));
      return apiError(
        429,
        "rate_limited",
        "Too many requests from your network. Please try again in a little while.",
        { retry_after: retryAfter },
      );
    }

    const { data: site } = await db.from("settings").select("value").eq("key", "site").maybeSingle();
    const consentVersion: string = site?.value?.consent_version ?? "unversioned";

    const columns = await categoryColumns(db, booking);
    if (columns.error) return apiError(400, "invalid", columns.error, { fields: columns.fields });

    const { data: rows, error } = await db.rpc("create_booking", {
      p: {
        category: booking.category,
        name: booking.name,
        phone: booking.phone,
        phone_verified_at: new Date(token.verifiedAt).toISOString(),
        email: booking.email,
        city: booking.city,
        preferred_date: "preferred_date" in booking ? booking.preferred_date : null,
        backup_date: "backup_date" in booking ? (booking.backup_date ?? null) : null,
        source: booking.source ?? null,
        consent_version: consentVersion,
        ip_hash: ipHash,
        ...columns,
      },
    });

    if (error) {
      if (isUniqueViolation(error, "bookings_one_open_per_phone_category")) {
        const { data: existing } = await db
          .from("bookings")
          .select("booking_code")
          .eq("phone", booking.phone)
          .eq("category", booking.category)
          .in("status", OPEN_STATUSES as BookingStatus[])
          .maybeSingle();
        return apiError(409, "duplicate", "You already have an open request in this category.", {
          booking_code: existing?.booking_code ?? null,
        });
      }
      const rule = ruleMessage(error);
      if (rule?.includes("not open for booking")) {
        return apiError(409, "meetup_closed", "This meetup is no longer taking bookings. Please choose another.");
      }
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
    return serverError("bookings", e);
  }
}

/**
 * Category columns for create_booking. `details` holds exactly the spec's keys;
 * budget, event and party size live on the bookings row.
 */
async function categoryColumns(db: ReturnType<typeof createAdminClient>, booking: BookingInput) {
  switch (booking.category) {
    case "podcast":
      return { details: booking.details, budget: booking.budget ?? null, attachments: [] };
    case "fan_meetup":
      return {
        details: { ...booking.details, consent_rules: true },
        budget: null,
        event_id: booking.event_id,
        party_size: booking.party_size ?? 1,
        attachments: [],
      };
    case "misc_event": {
      const attachments = [];
      if (booking.brief_path) {
        const file = await verifyUpload(db, booking.brief_path, "brief", booking.phone);
        if (!file) {
          return {
            error: "We couldn't find your uploaded brief. Please upload it again.",
            fields: { brief: "Upload failed. Check your connection and try again." },
          };
        }
        attachments.push({ ...file, kind: "brief" as const });
      }
      return { details: booking.details, budget: booking.budget, attachments };
    }
  }
}
