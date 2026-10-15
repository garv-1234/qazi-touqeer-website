import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, serverError } from "@/lib/server/http";

/** GET /api/admin/attachments/[id] — opens a private file through a signed link valid for 5 minutes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApi();
  if ("response" in auth) return auth.response;
  try {
    const { id } = await params;
    // Row-level security: only attachments of bookings this person can see.
    const { data: a } = await auth.db.from("attachments").select("storage_path").eq("id", id).maybeSingle();
    if (!a) return apiError(404, "not_found", "File not found");
    const { data, error } = await createAdminClient().storage.from("booking-files").createSignedUrl(a.storage_path, 300);
    if (error || !data) throw error ?? new Error("No signed URL");
    return NextResponse.redirect(data.signedUrl, { status: 302 });
  } catch (e) {
    return serverError("admin/attachment", e);
  }
}
