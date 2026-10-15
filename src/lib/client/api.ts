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

/** Checks a file, gets a signed upload URL, and uploads straight to private storage. */
export async function uploadFile(
  file: File,
  kind: UploadKind,
  token: string,
  bookingCode?: string,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Upload a PDF, JPEG, PNG or WEBP file." };
  }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, message: "Files must be 10 MB or smaller." };

  const signed = await postJson<{ bucket: string; path: string; upload_token: string }>("/api/uploads", {
    token,
    kind,
    mime_type: file.type,
    size_bytes: file.size,
    booking_code: bookingCode,
  });
  if (!signed.ok) return { ok: false, message: signed.error.message };

  const { error } = await createClient()
    .storage.from(signed.data.bucket)
    .uploadToSignedUrl(signed.data.path, signed.data.upload_token, file, { contentType: file.type });
  if (error) return { ok: false, message: "The upload failed. Please try again." };
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
