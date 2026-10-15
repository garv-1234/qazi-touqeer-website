import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CategoryCode } from "@/lib/booking/categories";
import type { Staff, StaffRole } from "./roles";
import { STAFF_SESSION_COOKIE, staffSessionValid } from "./session";

export type StaffSession = {
  staff: Staff;
  /** Acts as the logged-in staff member: row-level security applies. */
  db: Awaited<ReturnType<typeof createClient>>;
};

export type NoSession = "none" | "expired" | "no_access";

/**
 * Checks the logged-in user on the server every time: a Supabase session, a
 * staff session under 12 hours old, and an active staff profile.
 */
export async function getStaffSession(): Promise<StaffSession | { reason: NoSession }> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { reason: "none" };

  const since = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (!staffSessionValid(since, user.id)) return { reason: "expired" };

  const { data: profile } = await createAdminClient()
    .from("staff_profiles")
    .select("user_id, full_name, email, role, categories, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.active) return { reason: "no_access" };

  return {
    db,
    staff: {
      userId: profile.user_id,
      name: profile.full_name,
      email: profile.email,
      role: profile.role as StaffRole,
      categories: (profile.categories ?? []) as CategoryCode[],
    },
  };
}

/** The page the visitor asked for (set by src/proxy.ts), for "return to the page they were on". */
async function currentAdminPath(): Promise<string> {
  return (await headers()).get("x-admin-path") ?? "/admin";
}

/** For pages: redirect to login (signing out first when the session ended or access was removed). */
export async function requireStaffPage(): Promise<StaffSession> {
  const session = await getStaffSession();
  if ("staff" in session) return session;
  const next = encodeURIComponent(await currentAdminPath());
  if (session.reason === "none") redirect(`/admin/login?next=${next}`);
  redirect(`/api/admin/logout?reason=${session.reason}&next=${next}`);
}

/** For API routes: the session, or a JSON error response. */
export async function requireStaffApi(): Promise<StaffSession | { response: NextResponse }> {
  const session = await getStaffSession();
  if ("staff" in session) return session;
  const message =
    session.reason === "no_access" ? "This account doesn't have access. Contact your admin." : "Please log in again.";
  return {
    response: NextResponse.json({ error: "session", reason: session.reason, message }, { status: 401 }),
  };
}

/** Safe "next" target: only paths inside /admin. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") && !next.startsWith("/admin/login") ? next : "/admin";
}
