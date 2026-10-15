import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/server/http";

const SENT = "If this email has an account, we've sent a reset link.";

/** POST /api/admin/forgot — always the same answer, whether or not the email exists. */
export async function POST(req: Request) {
  const { data } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().max(254) }));
  if (data?.email && data.email.includes("@")) {
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      const supabase = await createClient();
      await supabase.auth.resetPasswordForEmail(data.email, { redirectTo: `${origin}/admin/set-password` });
    } catch (e) {
      console.error("admin/forgot", e);
    }
  }
  return NextResponse.json({ ok: true, message: SENT });
}
