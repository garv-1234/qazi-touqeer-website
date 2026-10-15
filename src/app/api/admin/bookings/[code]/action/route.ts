import { NextResponse } from "next/server";
import { ACTION_INPUTS, actionRequestSchema } from "@/lib/admin/action-inputs";
import { requireStaffApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, parseBody, serverError } from "@/lib/server/http";
import { fieldErrors } from "@/lib/validation";

const STALE = "This request has changed since you opened it. Reload to see its current status.";

/**
 * POST /api/admin/bookings/[code]/action — every booking action (spec "Actions").
 * The role is checked here and again inside public.staff_action(), which also
 * moves the status through transition_booking, writes audit_log and queues messages.
 */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStaffApi();
  if ("response" in auth) return auth.response;
  const { staff, db } = auth;

  const { data, response } = await parseBody(req, actionRequestSchema);
  if (response) return response;
  const input = ACTION_INPUTS[data.action].safeParse(data.input);
  if (!input.success) {
    return apiError(400, "invalid", "Please check the highlighted fields.", { fields: fieldErrors(input.error) });
  }

  try {
    const { code } = await params;
    // Visibility through row-level security: other categories are "not found".
    const { data: booking } = await db.from("bookings").select("id").eq("booking_code", code.toUpperCase()).maybeSingle();
    if (!booking) return apiError(404, "not_found", "Request not found");

    const { data: result, error } = await createAdminClient().rpc("staff_action", {
      p_actor: staff.userId,
      p_booking: booking.id,
      p_action: data.action,
      p_input: input.data,
      p_expected: data.expected ?? null,
    });
    if (error) {
      switch (error.code) {
        case "QT409":
          return apiError(409, "stale", STALE);
        case "QT403":
          return apiError(403, "forbidden", error.message);
        case "QT404":
          return apiError(404, "not_found", "Request not found");
        case "QT422":
          return apiError(422, "rule", error.message);
        case "23514":
          if (error.message.includes("No seats left")) {
            return apiError(409, "no_seats", "No seats left for this meetup. Keep it on the waitlist or decline.");
          }
          return apiError(409, "stale", STALE);
        default:
          throw error;
      }
    }
    return NextResponse.json(result);
  } catch (e) {
    return serverError("admin/action", e);
  }
}
