"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACTION_LABELS, type ActionName } from "@/lib/admin/actions";
import type { BookingDetail } from "@/lib/admin/detail";
import { formatAge, formatRupees, formatShortIST, formatUntil } from "@/lib/admin/format";
import type { StaffRole } from "@/lib/admin/roles";
import { formatDayDate } from "@/lib/booking/events";
import { postJson } from "@/lib/client/api";
import { ActionDialog } from "./action-dialog";
import { btn, CopyButton, FlagBadges, input, StatusChip } from "./bits";

type Nav = { prev: string | null; next: string | null; column: string; query: string } | null;

export type RunAction = (action: ActionName, input: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; message: string; fields?: Record<string, string> }>;

/** Actions that run straight from the button, with no dialog. */
const DIRECT: ActionName[] = ["start_review", "complete"];

export function BookingDetailView({ detail, role, nav, loadedAt }: { detail: BookingDetail; role: StaffRole; nav: Nav; loadedAt: number }) {
  const router = useRouter();
  const [stale, setStale] = useState<string | null>(null);
  const [open, setOpen] = useState<ActionName | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshing = useRef(false);

  // Someone else changed the request: show a banner and block actions until reload.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (refreshing.current) return;
      try {
        const res = await fetch(`/api/admin/bookings/${detail.code}/version`, { cache: "no-store" });
        if (res.status === 401) return router.replace(`/admin/login?reason=expired&next=/admin/bookings/${detail.code}`);
        if (!res.ok) return;
        const v = (await res.json()) as { updated_at: string; by: string };
        if (!cancelled && !refreshing.current && v.updated_at !== detail.updatedAt) setStale(v.by);
      } catch {
        /* offline: try again later */
      }
    };
    const interval = setInterval(check, 15_000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [detail.code, detail.updatedAt, router]);

  const run: RunAction = async (action, inputData) => {
    setBusy(true);
    setError(null);
    const res = await postJson<{ status: string; updated_at: string }>(`/api/admin/bookings/${detail.code}/action`, {
      action,
      input: inputData,
      expected: detail.updatedAt,
    });
    setBusy(false);
    if (res.ok) {
      // A new version remounts the page (key = updated_at); notes don't change the version.
      if (action !== "add_note") refreshing.current = true;
      setOpen(null);
      router.refresh();
      return { ok: true };
    }
    if (res.error.error === "session") {
      router.replace(`/admin/login?reason=expired&next=/admin/bookings/${detail.code}`);
      return { ok: false, message: res.error.message };
    }
    if (res.error.error === "stale") {
      const v = await fetch(`/api/admin/bookings/${detail.code}/version`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setStale((v as { by?: string } | null)?.by ?? "someone");
      setOpen(null);
    }
    return { ok: false, message: res.error.message, fields: res.error.fields };
  };

  const actions = detail.actions.filter((a) => a.action !== "add_note");
  const buttons = (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ action, disabledReason }) => {
        const label =
          action === "client_decide" ? (role === "super_admin" ? "Record client decision" : "Approve or decline") : ACTION_LABELS[action];
        const danger = action === "decline" || action === "cancel" || action === "release" || action === "reject_payment";
        return (
          <span key={action} className="inline-flex flex-col">
            <button
              type="button"
              disabled={!!stale || busy || !!disabledReason}
              aria-describedby={disabledReason ? `why_${action}` : undefined}
              className={danger ? btn.danger : action === actions[0]?.action ? btn.primary : btn.secondary}
              onClick={async () => {
                if (DIRECT.includes(action)) {
                  const r = await run(action, {});
                  if (!r.ok) setError(r.message);
                } else setOpen(action);
              }}
            >
              {label}
            </button>
            {disabledReason && (
              <span id={`why_${action}`} className="mt-1 max-w-56 text-xs text-neutral-500">
                {disabledReason}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28 md:pb-6">
      {nav && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <Link href={`/admin?${nav.query.replace(/^col=[^&]*&?/, "")}`} className="underline">
            ← Pipeline
          </Link>
          <span className="flex items-center gap-3">
            <span className="hidden sm:inline">{nav.column}</span>
            {nav.prev ? (
              <Link href={`/admin/bookings/${nav.prev}?${nav.query}`} className="underline" aria-label="Previous request">
                ‹ Previous
              </Link>
            ) : (
              <span className="opacity-40">‹ Previous</span>
            )}
            {nav.next ? (
              <Link href={`/admin/bookings/${nav.next}?${nav.query}`} className="underline" aria-label="Next request">
                Next ›
              </Link>
            ) : (
              <span className="opacity-40">Next ›</span>
            )}
          </span>
        </div>
      )}

      {stale && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>This request was updated by {stale} just now.</span>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              refreshing.current = true;
              router.refresh();
            }}
          >
            Reload
          </button>
        </div>
      )}

      {/* Header (stays visible while scrolling) */}
      <header className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-xl md:border md:bg-white md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-lg font-semibold text-neutral-900">{detail.code}</h1>
          <CopyButton text={detail.code} />
          <StatusChip status={detail.status} label={detail.statusLabel} />
          <span className="text-sm text-neutral-600">{detail.categoryLabel}</span>
          <FlagBadges flags={detail.flags} />
        </div>
        <p className="text-xs text-neutral-500">
          Owner: <span className="text-neutral-800">{detail.owner?.name ?? "Unassigned"}</span> · Created {formatShortIST(detail.createdAt)}
        </p>
        <div className="hidden md:block">{buttons}</div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <Panel title="Next step">
        <p className="text-sm font-medium text-neutral-900">{detail.nextStep}</p>
        {detail.client.needs && (
          <p className="mt-2 text-sm text-neutral-700">
            Client sign-off: {detail.client.decision ? `${detail.client.decision === "approved" ? "Approved" : "Declined"} by ${detail.client.decidedBy ?? "the client"}${detail.client.decidedAt ? `, ${formatShortIST(detail.client.decidedAt)}` : ""}` : "waiting"}
            {detail.client.note ? ` · Note for the client: "${detail.client.note}"` : ""}
            {detail.client.comment ? ` · Client comment: "${detail.client.comment}"` : ""}
          </p>
        )}
      </Panel>

      <Panel title="Requester">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <Row label="Name">{detail.requester.name}</Row>
          <Row label="WhatsApp number">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{detail.requester.phone}</span>
              {!detail.requester.masked && <CopyButton text={detail.requester.phone} />}
              {detail.requester.whatsapp && (
                <a href={detail.requester.whatsapp} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  WhatsApp
                </a>
              )}
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">
                Verified {formatShortIST(detail.requester.verifiedAt)}
              </span>
            </span>
          </Row>
          <Row label="Email">
            <span className="flex items-center gap-2">
              {detail.requester.email}
              {!detail.requester.masked && <CopyButton text={detail.requester.email} />}
            </span>
          </Row>
          {detail.requester.city && <Row label="City">{detail.requester.city}</Row>}
          {detail.requester.source && <Row label="Heard about Qazi">{detail.requester.source}</Row>}
        </dl>
      </Panel>

      <Panel title="Request">
        {detail.event && (
          <div className="mb-4 rounded-lg border border-neutral-200 p-3 text-sm">
            <p className="font-semibold text-neutral-900">
              {detail.event.city} · {detail.event.title}
            </p>
            <p className="text-neutral-700">
              {detail.event.venue} · {formatShortIST(detail.event.starts_at)}
            </p>
            <p className="text-neutral-700">
              {detail.event.ticket_price > 0 ? `${formatRupees(detail.event.ticket_price)} per person` : "Free"} · {detail.event.seats_left} of{" "}
              {detail.event.capacity} seats left now
            </p>
            {detail.waitlist.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-neutral-600">Waitlist for this meetup (in order)</p>
                <ol className="mt-1 list-inside list-decimal text-neutral-800">
                  {detail.waitlist.map((w) => (
                    <li key={w.code}>
                      <Link href={`/admin/bookings/${w.code}`} className="underline">
                        {w.code}
                      </Link>{" "}
                      {w.name} ({w.partySize})
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        <div className="space-y-5">
          {detail.answers.map((s) => (
            <section key={s.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{s.title}</h3>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
                {s.rows.map((r) => (
                  <Row key={r.label} label={r.label}>
                    {r.kind === "chips" ? (
                      <span className="flex flex-wrap gap-1">
                        {r.items!.map((i) => (
                          <span key={i} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                            {i}
                          </span>
                        ))}
                      </span>
                    ) : r.kind === "link" ? (
                      <a href={r.text} target="_blank" rel="noopener noreferrer" className="break-all underline">
                        {r.text}
                      </a>
                    ) : (
                      <span className={r.kind === "multiline" ? "whitespace-pre-line" : ""}>{r.text}</span>
                    )}
                  </Row>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Panel>

      {detail.attachments.length > 0 && (
        <Panel title="Attachments">
          <ul className="space-y-3 text-sm">
            {detail.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                {a.thumbUrl && (
                  // Short-lived signed thumbnail from private storage.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbUrl} alt="" className="size-12 rounded border object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.kind === "brief" ? "Event brief" : "Payment screenshot"} · {a.name}</span>
                  <span className="text-xs text-neutral-500">
                    {a.mime} · {(a.size / 1024 / 1024).toFixed(1)} MB · {formatShortIST(a.createdAt)}
                  </span>
                </span>
                <a href={`/api/admin/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
                  View
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {detail.payment.visible && (
        <Panel title="Payment">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <Row label="Advance due">{detail.payment.advance !== null ? formatRupees(detail.payment.advance) : "—"}</Row>
            {detail.payment.full && detail.payment.deadline && (
              <Row label="Deadline">
                {formatShortIST(detail.payment.deadline)} ({formatUntil(detail.payment.deadline, loadedAt)})
                {detail.payment.extended ? " · extended" : ""}
                {detail.payment.overdue ? " · overdue" : ""}
              </Row>
            )}
            {detail.payment.refund && (
              <Row label="Refund decision">
                {detail.payment.refund.decision === "none" ? "No refund" : `${detail.payment.refund.decision === "full" ? "Full" : "Partial"}: ${formatRupees(detail.payment.refund.amount ?? 0)}`}
              </Row>
            )}
          </dl>
          {detail.payment.full &&
            detail.payment.submissions.map((p) => (
              <div key={p.id} className="mt-3 rounded-lg border border-neutral-200 p-3 text-sm">
                <p className="font-medium">
                  {formatRupees(p.amountPaid)} · UTR <span className="font-mono">{p.utr}</span> · {p.method === "upi" ? "UPI" : "Bank transfer"} · paid on{" "}
                  {formatDayDate(p.paidOn)}
                </p>
                <p className="text-neutral-600">
                  {p.status === "submitted" ? "Waiting to be checked" : p.status === "verified" ? "Verified" : "Rejected"}
                  {p.verifiedBy ? ` by ${p.verifiedBy}` : ""}
                  {p.verifiedAt ? `, ${formatShortIST(p.verifiedAt)}` : ""}
                  {p.rejectReason ? ` — ${p.rejectReason}` : ""}
                  {p.screenshotId && (
                    <>
                      {" · "}
                      <a href={`/api/admin/attachments/${p.screenshotId}`} target="_blank" rel="noopener noreferrer" className="underline">
                        View screenshot
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
        </Panel>
      )}

      <Panel title="Notes and messages">
        <ol className="space-y-2">
          {detail.timeline.map((t) => (
            <li
              key={t.id}
              className={`rounded-lg px-3 py-2 text-sm ${t.kind === "internal" ? "bg-neutral-100 text-neutral-800" : "bg-sky-50 text-sky-950"}`}
            >
              <p className="text-xs text-neutral-500">
                {t.author} · {formatShortIST(t.createdAt)} ·{" "}
                <span className="font-medium">{t.kind === "internal" ? "Internal" : "Visible to requester"}</span>
                {t.kind === "reply" ? " (reply)" : ""}
              </p>
              <p className="mt-1 whitespace-pre-line">{t.body}</p>
            </li>
          ))}
          {detail.timeline.length === 0 && <li className="text-sm text-neutral-500">No notes yet.</li>}
        </ol>
        <NoteBox run={run} disabled={!!stale || busy} />
      </Panel>

      <Panel title="Messages sent">
        {detail.messages.length === 0 ? (
          <p className="text-sm text-neutral-500">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {detail.messages.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {formatShortIST(m.createdAt)} · {m.channel === "sms" ? "SMS" : m.channel === "whatsapp" ? "WhatsApp" : "Email"}
                  {m.audience === "team" ? " (team)" : ""} · <span className="font-mono text-xs">{m.template}</span>
                </span>
                <span className={m.status === "failed" ? "text-red-700" : "text-neutral-600"}>
                  {m.status === "queued" ? "Queued — will be sent once messaging is set up" : m.status}
                  {m.error ? `: ${m.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="History">
        <ol className="space-y-2 text-sm">
          {detail.history.map((h, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 pb-2 last:border-0">
              <span>
                {h.from ? `${h.from} → ` : ""}
                <span className="font-medium">{h.to}</span>
                {h.reason ? ` · ${h.reason}` : ""}
              </span>
              <span className="text-neutral-500">
                {h.who} · {formatShortIST(h.createdAt)} ({formatAge(h.createdAt, loadedAt)})
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      {/* Phone: actions in a bar at the bottom of the screen */}
      {actions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[40vh] overflow-y-auto border-t border-neutral-200 bg-white p-3 md:hidden">{buttons}</div>
      )}

      {open && <ActionDialog action={open} detail={detail} run={run} busy={busy} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-neutral-200 bg-white p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-words text-neutral-900">{children}</dd>
    </>
  );
}

function NoteBox({ run, disabled }: { run: RunAction; disabled: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("add_note", { body });
        if (r.ok) setBody("");
        else setError(r.fields?.body ?? r.message);
      }}
    >
      <label htmlFor="note" className="text-xs font-medium text-neutral-600">
        Add an internal note
      </label>
      <textarea id="note" rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className={input} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={disabled || body.trim().length === 0} className={btn.secondary}>
        Add note
      </button>
    </form>
  );
}
