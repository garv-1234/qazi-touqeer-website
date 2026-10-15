import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Staff sessions last 12 hours from login (spec), however long Supabase keeps
 * refreshing its own tokens. A signed cookie records who logged in and when.
 */
export const STAFF_SESSION_COOKIE = "qt_staff_since";
export const STAFF_SESSION_HOURS = 12;

function sign(data: string): string {
  const secret = process.env.OTP_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("OTP_TOKEN_SECRET must be set to a random string of 32+ characters");
  return createHmac("sha256", secret).update(`staff-session:${data}`).digest("base64url");
}

export function issueStaffSession(userId: string) {
  const data = `${userId}.${Date.now()}`;
  return {
    name: STAFF_SESSION_COOKIE,
    value: `${data}.${sign(data)}`,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STAFF_SESSION_HOURS * 3600,
    },
  };
}

/** True if the cookie is genuine, belongs to this user and is under 12 hours old. */
export function staffSessionValid(cookieValue: string | undefined, userId: string): boolean {
  if (!cookieValue) return false;
  const [uid, ts, sig] = cookieValue.split(".");
  if (!uid || !ts || !sig || uid !== userId) return false;
  const expected = Buffer.from(sign(`${uid}.${ts}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const age = Date.now() - Number(ts);
  return Number.isFinite(age) && age >= 0 && age < STAFF_SESSION_HOURS * 3600e3;
}
