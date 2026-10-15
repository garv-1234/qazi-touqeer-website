"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { btn, input } from "./bits";

type Item = {
  code: string;
  updatedAt: string;
  category: string;
  name: string;
  detail: string;
  date: string;
  budget: string | null;
  note: string | null;
};

/** The client approver's short list: approve or decline in one tap (comment optional). */
export function ApprovalsList({ items, canDecide, onBehalf }: { items: Item[]; canDecide: boolean; onBehalf: boolean }) {
  if (items.length === 0) return <p className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">Nothing is waiting for sign-off.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <ApprovalCard key={i.code} item={i} canDecide={canDecide} onBehalf={onBehalf} />
      ))}
    </ul>
  );
}

function ApprovalCard({ item, canDecide, onBehalf }: { item: Item; canDecide: boolean; onBehalf: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(decision: "approved" | "declined") {
    setBusy(true);
    setMessage(null);
    const res = await postJson(`/api/admin/bookings/${item.code}/action`, {
      action: "client_decide",
      input: { decision, comment: comment || undefined },
      expected: item.updatedAt,
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setMessage(res.error.message);
  }

  return (
    <li className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/admin/bookings/${item.code}`} className="font-mono text-sm underline">
          {item.code}
        </Link>
        <span className="text-xs text-neutral-500">{item.category}</span>
      </div>
      <p className="text-base font-medium text-neutral-900">
        {item.name}
        {item.detail ? ` · ${item.detail}` : ""}
      </p>
      <p className="text-sm text-neutral-700">
        {item.date}
        {item.budget ? ` · ${item.budget}` : ""}
      </p>
      {item.note && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-950">“{item.note}”</p>}
      {canDecide ? (
        <>
          <label htmlFor={`c_${item.code}`} className="sr-only">
            Comment (optional)
          </label>
          <input
            id={`c_${item.code}`}
            placeholder="Comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={input}
          />
          {onBehalf && <p className="text-xs text-neutral-500">You are recording this on the client&apos;s behalf.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void decide("declined")} className={`${btn.danger} py-3`}>
              Decline
            </button>
            <button type="button" disabled={busy} onClick={() => void decide("approved")} className={`${btn.primary} py-3`}>
              Approve
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-neutral-500">Waiting for the client approver.</p>
      )}
      {message && (
        <p role="alert" className="text-sm text-red-700">
          {message}
        </p>
      )}
    </li>
  );
}
