"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FLAG_LABELS, type FlagCode } from "@/lib/admin/flags";
import type { BookingStatus } from "@/lib/booking/status";

const FLAG_TONE: Record<FlagCode, string> = {
  overdue: "bg-red-100 text-red-800",
  below_minimum: "bg-amber-100 text-amber-900",
  needs_client: "bg-violet-100 text-violet-900",
  client_approved: "bg-emerald-100 text-emerald-900",
  client_declined: "bg-red-100 text-red-800",
  restricted: "bg-red-100 text-red-800",
  info_requested: "bg-sky-100 text-sky-900",
  replied: "bg-sky-100 text-sky-900",
  unassigned: "bg-neutral-100 text-neutral-700",
  event_passed: "bg-amber-100 text-amber-900",
};

export function FlagBadges({ flags }: { flags: FlagCode[] }) {
  if (!flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${FLAG_TONE[f]}`}>
          {FLAG_LABELS[f]}
        </span>
      ))}
    </span>
  );
}

const STATUS_TONE: Partial<Record<BookingStatus, string>> = {
  submitted: "bg-sky-600",
  waitlisted: "bg-neutral-500",
  in_review: "bg-indigo-600",
  info_requested: "bg-indigo-400",
  payment_pending: "bg-amber-600",
  payment_submitted: "bg-orange-600",
  confirmed: "bg-emerald-600",
  completed: "bg-neutral-700",
};

export function StatusChip({ status, label }: { status: BookingStatus; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium text-white ${STATUS_TONE[status] ?? "bg-neutral-400"}`}>
      {label}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        )
      }
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/** Accessible modal dialog (native <dialog>). */
export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="modal_title"
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal_title" className="text-base font-semibold text-neutral-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500 hover:text-neutral-900" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40",
  danger:
    "inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40",
};

export const input =
  "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10";
