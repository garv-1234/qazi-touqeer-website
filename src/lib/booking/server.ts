import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneFolder } from "@/lib/server/crypto";
import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES, type UploadKind } from "@/lib/validation";
import { CATEGORY_INFO, NEXT_STEP, type CategoryCode } from "./categories";
import { requesterCanTransition, STATUS_LABELS, type BookingStatus } from "./status";

export const BOOKING_FILES_BUCKET = "booking-files";

export type BookingRow = {
  id: string;
  booking_code: string;
  category: CategoryCode;
  status: BookingStatus;
  name: string;
  phone: string;
  email: string;
  preferred_date: string | null;
  party_size: number;
  is_waitlist: boolean;
  advance_amount: string | number | null;
  payment_deadline: string | null;
  created_at: string;
  event_id: string | null;
};

const BOOKING_COLUMNS =
  "id, booking_code, category, status, name, phone, email, preferred_date, party_size, is_waitlist, advance_amount, payment_deadline, created_at, event_id";

/** Finds a booking by its ID, only if it belongs to this (OTP-verified) phone. */
export async function findBookingForPhone(db: SupabaseClient, bookingCode: string, phone: string) {
  const { data, error } = await db
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("booking_code", bookingCode)
    .eq("phone", phone)
    .maybeSingle<BookingRow>();
  if (error) throw error;
  return data;
}

/** Storage folder a phone may upload into for a kind of file. */
export const uploadFolder = (kind: UploadKind, phone: string) => `${kind}/${phoneFolder(phone)}/`;

export type VerifiedUpload = { storage_path: string; mime_type: string; size_bytes: number };

/**
 * Checks that an uploaded file belongs to this phone, exists, and is an
 * allowed type and size (the bucket enforces the same limits on upload).
 */
export async function verifyUpload(
  db: SupabaseClient,
  path: string,
  kind: UploadKind,
  phone: string,
): Promise<VerifiedUpload | null> {
  if (!path.startsWith(uploadFolder(kind, phone)) || path.includes("..")) return null;
  const { data, error } = await db.storage.from(BOOKING_FILES_BUCKET).info(path);
  if (error || !data) return null;
  const size = data.size ?? 0;
  const mime = data.contentType ?? "";
  if (size < 1 || size > UPLOAD_MAX_BYTES) return null;
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(mime)) return null;
  return { storage_path: path, mime_type: mime, size_bytes: size };
}

type PaymentDetails = {
  upi_id?: string;
  upi_qr_path?: string;
  account_name?: string;
  account_number?: string;
  ifsc?: string;
  bank_name?: string;
};

/** Everything Track My Booking shows for one booking (FR-W7). */
export async function buildTrackView(db: SupabaseClient, b: BookingRow) {
  const [event, lastPayment, infoRequest, paymentDetails] = await Promise.all([
    b.event_id
      ? db.from("events").select("title, city, venue, starts_at").eq("id", b.event_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("payments")
      .select("status, utr, amount_paid, paid_on, reject_reason, created_at")
      .eq("booking_id", b.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    b.status === "info_requested"
      ? db
          .from("booking_notes")
          .select("body, created_at")
          .eq("booking_id", b.id)
          .eq("author_type", "staff")
          .eq("internal", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    b.status === "payment_pending"
      ? db.from("settings").select("value").eq("key", "payment_details").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let payment = null;
  if (b.status === "payment_pending") {
    const pd: PaymentDetails = paymentDetails.data?.value ?? {};
    let upiQrUrl: string | null = null;
    if (pd.upi_qr_path) {
      const { data } = await db.storage.from(BOOKING_FILES_BUCKET).createSignedUrl(pd.upi_qr_path, 15 * 60);
      upiQrUrl = data?.signedUrl ?? null;
    }
    payment = {
      amount: b.advance_amount === null ? null : Number(b.advance_amount),
      deadline: b.payment_deadline,
      overdue: b.payment_deadline !== null && new Date(b.payment_deadline) < new Date(),
      reference: b.booking_code,
      upi_id: pd.upi_id || null,
      upi_qr_url: upiQrUrl,
      bank:
        pd.account_number && pd.ifsc
          ? {
              account_name: pd.account_name ?? "",
              account_number: pd.account_number,
              ifsc: pd.ifsc,
              bank_name: pd.bank_name ?? "",
            }
          : null,
    };
  }

  const lp = lastPayment.data;
  return {
    booking_code: b.booking_code,
    category: b.category,
    category_label: CATEGORY_INFO[b.category].label,
    status: b.status,
    status_label: STATUS_LABELS[b.status],
    next_step: NEXT_STEP[b.status],
    created_at: b.created_at,
    preferred_date: b.preferred_date,
    party_size: b.party_size,
    is_waitlist: b.is_waitlist,
    event: event.data ?? null,
    payment,
    last_payment: lp
      ? {
          status: lp.status as "submitted" | "verified" | "rejected",
          utr_last4: String(lp.utr).slice(-4),
          amount_paid: Number(lp.amount_paid),
          paid_on: lp.paid_on,
          reject_reason: lp.status === "rejected" ? lp.reject_reason : null,
        }
      : null,
    info_request: infoRequest.data ? { question: infoRequest.data.body, asked_at: infoRequest.data.created_at } : null,
    can_cancel: requesterCanTransition(b.status, "cancelled"),
    can_pay: requesterCanTransition(b.status, "payment_submitted"),
    can_reply: requesterCanTransition(b.status, "in_review"),
  };
}

export type TrackView = Awaited<ReturnType<typeof buildTrackView>>;
