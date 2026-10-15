import { NextResponse } from "next/server";
import { safeNext } from "@/lib/admin/auth";
import { STAFF_SESSION_COOKIE } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase/server";

async function signOutAndRedirect(req: Request) {
  const url = new URL(req.url);
  const reason = url.searchParams.get("reason");
  const next = url.searchParams.get("next");
  const supabase = await createClient();
  await supabase.auth.signOut();

  const login = new URL("/admin/login", url.origin);
  if (reason === "expired" || reason === "no_access") login.searchParams.set("reason", reason);
  if (next) login.searchParams.set("next", safeNext(next));
  const res = NextResponse.redirect(login, { status: 303 });
  res.cookies.delete(STAFF_SESSION_COOKIE);
  return res;
}

/** GET /api/admin/logout?reason=expired|no_access&next=… — used when a session ends. */
export const GET = signOutAndRedirect;
/** POST /api/admin/logout — the Log out button. */
export const POST = signOutAndRedirect;
