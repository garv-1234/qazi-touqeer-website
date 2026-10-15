"use client";

import { createClient } from "@/lib/supabase/browser";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES, type UploadKind } from "@/lib/validation";

export type ApiError = {
  error: string;
  message: string;
  fields?: Record<string, string>;
  [extra: string]: unknown;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    return {
      ok: false,
      status: res.status,
      error: json?.message ? (json as ApiError) : { error: "http", message: "Something went wrong. Please try again." },
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { error: "network", message: "You seem to be offline. Check your connection and try again." },
    };
  }
}

export const UPLOAD_MESSAGES = {
  type: "Upload a PDF, JPG, PNG or WEBP file.",
  size: "This file is over 10 MB.",
  failed: "Upload failed. Check your connection and try again.",
  auth: "For your security, please verify your number again.",
} as const;

export type UploadFailure = keyof typeof UPLOAD_MESSAGES;

/** Type and size check done before any upload starts. */
export function checkUploadFile(file: File): UploadFailure | null {
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > UPLOAD_MAX_BYTES) return "size";
  return null;
}

/** Checks a file, gets a signed upload URL, and uploads straight to private storage. */
export async function uploadFile(
  file: File,
  kind: UploadKind,
  token: string,
  bookingCode?: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: UploadFailure; message: string }> {
  const fail = (reason: UploadFailure) => ({ ok: false as const, reason, message: UPLOAD_MESSAGES[reason] });
  const problem = checkUploadFile(file);
  if (problem) return fail(problem);

  const signed = await postJson<{ bucket: string; path: string; upload_token: string }>("/api/uploads", {
    token,
    kind,
    mime_type: file.type,
    size_bytes: file.size,
    booking_code: bookingCode,
  });
  if (!signed.ok) return fail(signed.error.error === "otp_required" ? "auth" : "failed");

  try {
    const { error } = await createClient()
      .storage.from(signed.data.bucket)
      .uploadToSignedUrl(signed.data.path, signed.data.upload_token, file, { contentType: file.type });
    if (error) return fail("failed");
  } catch {
    return fail("failed");
  }
  return { ok: true, path: signed.data.path };
}

// FormData readers: blank inputs become undefined so optional fields validate.
export const str = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
export const num = (fd: FormData, name: string) => {
  const v = str(fd, name);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
export const checked = (fd: FormData, name: string) => fd.get(name) === "on";
export const file = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return v instanceof File && v.size > 0 ? v : undefined;
};
