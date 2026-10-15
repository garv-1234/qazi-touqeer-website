import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, serverError } from "@/lib/server/http";

/** GET /api/admin/bookings/[code]/version — who changed the request last, for the "updated by" banner. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStaffApi();
  if ("response" in auth) return auth.response;
  try {
    const { code } = await params;
    const { data: b } = await auth.db
      .from("bookings")
      .select("id, booking_code, updated_at")
      .eq("booking_code", code.toUpperCase())
      .maybeSingle();
    if (!b) return apiError(404, "not_found", "Request not found");

    const admin = createAdminClient();
    const [{ data: audit }, { data: hist }] = await Promise.all([
      admin
        .from("audit_log")
        .select("actor_id, created_at")
        .eq("entity", "booking")
        .eq("entity_id", b.booking_code)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("booking_status_history")
        .select("actor_type, created_at")
        .eq("booking_id", b.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    let by = "someone";
    const auditAt = audit ? new Date(audit.created_at).getTime() : 0;
    const histAt = hist ? new Date(hist.created_at).getTime() : 0;
    if (hist && histAt > auditAt && hist.actor_type !== "staff") {
      by = hist.actor_type === "requester" ? "the requester" : "the system";
    } else if (audit?.actor_id) {
      const { data: s } = await admin.from("staff_profiles").select("full_name").eq("user_id", audit.actor_id).maybeSingle();
      by = audit.actor_id === auth.staff.userId ? "you" : (s?.full_name ?? "a staff member");
    }
    return NextResponse.json({ updated_at: b.updated_at, by }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError("admin/version", e);
  }
}
