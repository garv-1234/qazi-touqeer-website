import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpPurpose } from "@/lib/validation";

function secret(name: "HASH_SALT" | "OTP_TOKEN_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to a random string of 32+ characters`);
  }
  return value;
}

const hmac = (key: string, data: string) => createHmac("sha256", key).update(data).digest();

// ---------------------------------------------------------------------
// Hashes (HASH_SALT). Phones and IPs are never stored in otp_codes in clear.
// ---------------------------------------------------------------------
export const phoneHash = (phone: string) => hmac(secret("HASH_SALT"), `phone:${phone}`).toString("hex");
export const otpCodeHash = (phone: string, code: string) =>
  hmac(secret("HASH_SALT"), `otp:${phone}:${code}`).toString("hex");
export const ipHash = (ip: string) => hmac(secret("HASH_SALT"), `ip:${ip}`).toString("hex");

/** Short folder name for a phone's uploads, so storage paths never contain the number. */
export const phoneFolder = (phone: string) => phoneHash(phone).slice(0, 24);

/** 6-digit OTP from a cryptographically secure source. */
export const generateOtp = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

// ---------------------------------------------------------------------
// OTP token (OTP_TOKEN_SECRET): proof that a phone passed OTP for a purpose.
// Format: base64url(payload).base64url(hmac)
// ---------------------------------------------------------------------
export const OTP_TOKEN_TTL_SECONDS = 30 * 60;

export type OtpToken = {
  phone: string;
  purpose: OtpPurpose;
  /** When the OTP was verified (ms since epoch). */
  verifiedAt: number;
  /** Expiry (ms since epoch). */
  exp: number;
};

export function signOtpToken(phone: string, purpose: OtpPurpose): string {
  const now = Date.now();
  const payload: OtpToken = { phone, purpose, verifiedAt: now, exp: now + OTP_TOKEN_TTL_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(secret("OTP_TOKEN_SECRET"), body).toString("base64url");
  return `${body}.${sig}`;
}

/** Returns the token payload if the signature, purpose and expiry all check out. */
export function verifyOtpToken(token: string, purpose: OtpPurpose): OtpToken | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = hmac(secret("OTP_TOKEN_SECRET"), body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OtpToken;
    if (payload.purpose !== purpose || typeof payload.phone !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
