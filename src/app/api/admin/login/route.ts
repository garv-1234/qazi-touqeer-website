import { NextResponse } from "next/server";
import { z } from "zod";
import { safeNext } from "@/lib/admin/auth";
import { issueStaffSession } from "@/lib/admin/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, clientIpHash, parseBody, serverError } from "@/lib/server/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

const WRONG = "Email or password is incorrect.";
const NO_ACCESS = "This account doesn't have access. Contact your admin.";

/** POST /api/admin/login — staff email + password (Supabase Auth), then the staff check. */
export async function POST(req: Request) {
  const { data, response } = await parseBody(req, schema);
  if (response) return apiError(400, "invalid", WRONG);

  try {
    const admin = createAdminClient();
    const ipHash = clientIpHash(req);
    const record = (success: boolean, userId?: string, reason?: string) =>
      admin.rpc("record_staff_login", {
        p_email: data.email,
        p_success: success,
        p_user_id: userId ?? null,
        p_ip_hash: ipHash,
        p_reason: reason ?? null,
      });

    const { data: locked, error: lockError } = await admin.rpc("staff_login_locked", { p_email: data.email });
    if (lockError) throw lockError;
    if (locked) return apiError(429, "locked", "Too many attempts. Try again in 15 minutes.");

    const supabase = await createClient();
    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error || !auth.user) {
      await record(false, undefined, "bad_credentials");
      // Same message for an unknown email and a wrong password.
      return apiError(401, "wrong", WRONG);
    }

    const { data: profile } = await admin
      .from("staff_profiles")
      .select("active")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!profile?.active) {
      await supabase.auth.signOut();
      await record(false, auth.user.id, profile ? "deactivated" : "not_staff");
      return apiError(403, "no_access", NO_ACCESS);
    }

    await record(true, auth.user.id);
    const res = NextResponse.json({ ok: true, next: safeNext(data.next) });
    const session = issueStaffSession(auth.user.id);
    res.cookies.set(session.name, session.value, session.options);
    return res;
  } catch (e) {
    return serverError("admin/login", e);
  }
}
