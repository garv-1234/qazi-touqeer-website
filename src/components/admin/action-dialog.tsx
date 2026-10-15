"use client";

import { useState, type ReactNode } from "react";
import { ACTION_LABELS, DECLINE_REASONS, REJECT_PAYMENT_REASONS, type ActionName } from "@/lib/admin/actions";
import type { BookingDetail } from "@/lib/admin/detail";
import { formatRupees, formatShortIST, fromISTInput, toISTInput } from "@/lib/admin/format";
import { formatIndianDigits } from "@/lib/booking/events";
import { btn, input, Modal } from "./bits";
import type { RunAction } from "./booking-detail";

type Props = { action: ActionName; detail: BookingDetail; run: RunAction; busy: boolean; onClose: () => void };

const plusHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600e3).toISOString();
const nowIso = () => new Date().toISOString();
/** Latest of the current deadline and now: extensions are counted from here. */
const extensionBase = (deadline: string) => (new Date(deadline).getTime() > Date.now() ? deadline : nowIso());

/** Inputs and the spec's confirmation wording for each action. */
export function ActionDialog({ action, detail, run, busy, onClose }: Props) {
  const name = detail.requester.firstName;
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (inputData: Record<string, unknown>) => {
    setError(null);
    setFields({});
    const r = await run(action, inputData);
    if (!r.ok) {
      setError(r.message);
      setFields(r.fields ?? {});
    }
  };

  const footer = (confirmText: string | null, label: string, disabled: boolean, onConfirm: () => void, danger = false) => (
    <div className="space-y-3 border-t border-neutral-200 pt-4">
      {confirmText && <p className="text-sm font-medium text-neutral-900">{confirmText}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" disabled={busy || disabled} className={danger ? btn.danger : btn.primary} onClick={onConfirm}>
          {busy ? "Working…" : label}
        </button>
      </div>
    </div>
  );

  const fieldError = (k: string) => (fields[k] ? <p className="mt-1 text-sm text-red-700">{fields[k]}</p> : null);

  let body: ReactNode = null;
  switch (action) {
    case "assign":
      body = <Assign detail={detail} footer={footer} submit={submit} />;
      break;
    case "request_info":
      body = <RequestInfo name={name} footer={footer} submit={submit} fieldError={fieldError} />;
      break;
    case "flag_client":
      body = <FlagClient footer={footer} submit={submit} />;
      break;
    case "approve":
      body = <Approve detail={detail} footer={footer} submit={submit} fieldError={fieldError} />;
      break;
    case "decline":
      body = <ReasonForm reasons={DECLINE_REASONS} confirm={`Decline this request? ${name} will be told.`} label="Decline" footer={footer} submit={submit} fieldError={fieldError} />;
      break;
    case "mark_paid":
      body = <MarkPaid detail={detail} footer={footer} submit={submit} />;
      break;
    case "reject_payment":
      body = <ReasonForm reasons={REJECT_PAYMENT_REASONS} confirm={null} label="Reject payment" footer={footer} submit={submit} fieldError={fieldError} extend />;
      break;
    case "extend_deadline":
      body = <Extend detail={detail} footer={footer} submit={submit} fieldError={fieldError} />;
      break;
    case "release":
      body = <Release name={name} footer={footer} submit={submit} />;
      break;
    case "offer_seat":
      body = footer(`Offer a seat to ${name}?`, "Offer seat", false, () => void submit({}));
      break;
    case "cancel":
      body = <Cancel detail={detail} footer={footer} submit={submit} fieldError={fieldError} />;
      break;
    case "client_decide":
      body = <ClientDecide footer={footer} submit={submit} />;
      break;
    default:
      body = footer(null, ACTION_LABELS[action], false, () => void submit({}));
  }

  return (
    <Modal title={ACTION_LABELS[action]} open onClose={onClose}>
      {body}
    </Modal>
  );
}

type Footer = (confirmText: string | null, label: string, disabled: boolean, onConfirm: () => void, danger?: boolean) => ReactNode;
type Submit = (input: Record<string, unknown>) => Promise<void>;
type FieldError = (k: string) => ReactNode;

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
      {children}
    </label>
  );
}

function Assign({ detail, footer, submit }: { detail: BookingDetail; footer: Footer; submit: Submit }) {
  const [owner, setOwner] = useState(detail.owner?.id ?? "");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="owner">Staff member</Label>
        <select id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
          <option value="">Choose…</option>
          {detail.inputs.assignable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500">Only people who can see this category are listed.</p>
      </div>
      {footer(null, "Assign", !owner, () => void submit({ owner_id: owner }))}
    </div>
  );
}

function RequestInfo({ name, footer, submit, fieldError }: { name: string; footer: Footer; submit: Submit; fieldError: FieldError }) {
  const [q, setQ] = useState("");
  const len = q.trim().length;
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="question">Question (visible to the requester)</Label>
        <textarea id="question" rows={4} maxLength={1000} value={q} onChange={(e) => setQ(e.target.value)} className={input} />
        <p className="mt-1 text-xs text-neutral-500">{len.toLocaleString("en-IN")} / 1,000 · at least 10 characters</p>
        {fieldError("question")}
      </div>
      {footer(`Send this question to ${name}?`, "Send question", len < 10, () => void submit({ question: q }))}
    </div>
  );
}

function FlagClient({ footer, submit }: { footer: Footer; submit: Submit }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cnote">Note for the client (optional)</Label>
        <textarea id="cnote" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={input} />
      </div>
      {footer(null, "Flag for sign-off", false, () => void submit({ note: note || undefined }))}
    </div>
  );
}

function Approve({ detail, footer, submit, fieldError }: { detail: BookingDetail; footer: Footer; submit: Submit; fieldError: FieldError }) {
  const [amount, setAmount] = useState(detail.inputs.defaultAdvance ? String(detail.inputs.defaultAdvance) : "");
  const [deadline, setDeadline] = useState(toISTInput(detail.inputs.defaultDeadline));
  const [message, setMessage] = useState("");
  const amt = Number(amount);
  const iso = fromISTInput(deadline);
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="amount">Advance amount (₹)</Label>
        <input
          id="amount"
          inputMode="numeric"
          value={formatIndianDigits(amount)}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9))}
          className={input}
        />
        {fieldError("advance_amount")}
      </div>
      <div>
        <Label htmlFor="deadline">Payment deadline (India time)</Label>
        <input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={input} />
        <p className="mt-1 text-xs text-neutral-500">At least 1 hour and at most 14 days away.</p>
        {fieldError("payment_deadline")}
      </div>
      <div>
        <Label htmlFor="amsg">Message to the requester (optional)</Label>
        <textarea id="amsg" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className={input} />
      </div>
      {footer(
        amt > 0 && iso ? `Approve and ask for ${formatRupees(amt)} by ${formatShortIST(iso)}?` : null,
        "Approve",
        !(amt > 0 && iso),
        () => void submit({ advance_amount: amt, payment_deadline: iso, message: message || undefined }),
      )}
    </div>
  );
}

function ReasonForm({
  reasons,
  confirm,
  label,
  footer,
  submit,
  fieldError,
  extend = false,
}: {
  reasons: readonly (readonly [string, string])[];
  confirm: string | null;
  label: string;
  footer: Footer;
  submit: Submit;
  fieldError: FieldError;
  extend?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [extend24, setExtend24] = useState(false);
  const needsMessage = reason === "other" && !message.trim();
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="reason">Reason</Label>
        <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
          <option value="">Choose…</option>
          {reasons.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {fieldError("reason")}
      </div>
      <div>
        <Label htmlFor="rmsg">Message to the requester{reason === "other" ? " (required)" : " (optional)"}</Label>
        <textarea id="rmsg" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className={input} />
        {fieldError("message")}
      </div>
      {extend && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={extend24} onChange={(e) => setExtend24(e.target.checked)} />
          Also extend the deadline by 24 hours
        </label>
      )}
      {footer(confirm, label, !reason || needsMessage, () => void submit({ reason, message: message || undefined, ...(extend ? { extend_24h: extend24 } : {}) }), true)}
    </div>
  );
}

function MarkPaid({ detail, footer, submit }: { detail: BookingDetail; footer: Footer; submit: Submit }) {
  const p = detail.inputs.latestPayment;
  const [found, setFound] = useState(false);
  const [amountOk, setAmountOk] = useState(false);
  if (!p) return <p className="text-sm">There is no payment waiting to be checked.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        {formatRupees(p.amountPaid)} paid against {formatRupees(p.amountDue)} due · UTR <span className="font-mono">{p.utr}</span>
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={found} onChange={(e) => setFound(e.target.checked)} className="mt-0.5" />I found this UTR in the bank or UPI account
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={amountOk} onChange={(e) => setAmountOk(e.target.checked)} className="mt-0.5" />
        The amount received is {formatRupees(p.amountDue)} or more
      </label>
      {footer(
        `Confirm ${formatRupees(p.amountPaid)} (UTR ${p.utr})? This confirms the booking.`,
        "Mark paid",
        !(found && amountOk),
        () => void submit({ found_utr: found, amount_ok: amountOk }),
      )}
    </div>
  );
}

function Extend({ detail, footer, submit, fieldError }: { detail: BookingDetail; footer: Footer; submit: Submit; fieldError: FieldError }) {
  const [current] = useState(() => detail.payment.deadline ?? nowIso());
  const [base] = useState(() => extensionBase(current));
  const [deadline, setDeadline] = useState(() => toISTInput(plusHours(current, 24)));
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">Current deadline: {formatShortIST(current)}. A deadline can be extended once, by up to 7 days.</p>
      <div>
        <Label htmlFor="newdl">New deadline (India time)</Label>
        <input
          id="newdl"
          type="datetime-local"
          value={deadline}
          max={toISTInput(plusHours(base, 7 * 24))}
          onChange={(e) => setDeadline(e.target.value)}
          className={input}
        />
        {fieldError("payment_deadline")}
      </div>
      {footer(null, "Extend deadline", !deadline, () => void submit({ payment_deadline: fromISTInput(deadline) }))}
    </div>
  );
}

function Release({ name, footer, submit }: { name: string; footer: Footer; submit: Submit }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="rnote">Note (optional)</Label>
        <textarea id="rnote" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={input} />
      </div>
      {footer(`Release this slot? The booking will expire and ${name} will be told.`, "Release slot", false, () => void submit({ message: note || undefined }), true)}
    </div>
  );
}

function Cancel({ detail, footer, submit, fieldError }: { detail: BookingDetail; footer: Footer; submit: Submit; fieldError: FieldError }) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<"" | "full" | "partial" | "none">("");
  const [amount, setAmount] = useState("");
  const paid = detail.inputs.paid;
  const ready = reason.trim().length >= 2 && (!paid || (refund && (refund !== "partial" || Number(amount) > 0)));
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="creason">Reason</Label>
        <textarea id="creason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
        {fieldError("reason")}
      </div>
      {paid && (
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-neutral-800">Refund decision (paid {formatRupees(detail.inputs.paidTotal)})</legend>
          {(
            [
              ["full", "Full refund"],
              ["partial", "Partial refund"],
              ["none", "No refund"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="refund" checked={refund === k} onChange={() => setRefund(k)} />
              {l}
            </label>
          ))}
          {refund === "partial" && (
            <div>
              <Label htmlFor="ramount">Refund amount (₹)</Label>
              <input
                id="ramount"
                inputMode="numeric"
                value={formatIndianDigits(amount)}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))}
                className={input}
              />
              {fieldError("refund_amount")}
            </div>
          )}
        </fieldset>
      )}
      {footer(
        "Cancel this booking? This can't be undone.",
        "Cancel booking",
        !ready,
        () =>
          void submit({
            reason,
            ...(paid ? { refund, ...(refund === "partial" ? { refund_amount: Number(amount) } : {}) } : {}),
          }),
        true,
      )}
    </div>
  );
}

function ClientDecide({ footer, submit }: { footer: Footer; submit: Submit }) {
  const [comment, setComment] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ccomment">Comment (optional)</Label>
        <textarea id="ccomment" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={input} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btn.danger} onClick={() => void submit({ decision: "declined", comment: comment || undefined })}>
          Decline
        </button>
        {footer(null, "Approve", false, () => void submit({ decision: "approved", comment: comment || undefined }))}
      </div>
    </div>
  );
}
