"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PhoneVerify, useHydrated } from "@/components/booking/phone-verify";
import { useBotCheck } from "@/components/booking/bot-check";
import { Button } from "@/components/ui";
import { CATEGORY_INFO } from "@/lib/booking/categories";
import { checkUploadFile, postJson, UPLOAD_MESSAGES, uploadFile } from "@/lib/client/api";
import { parseBooking } from "@/lib/validation";
import { formatAnswer } from "./display";
import { Field, fieldId, type FileState } from "./fields";
import { applyChange, CONSENT_LABELS, detailFieldOrder, errorsByKey, fieldShown, toPayload, type Consents } from "./logic";
import type { FieldDef, FormConfig, SectionContext, Values } from "./types";

const STEP_NAMES = ["Verify phone", "Details", "Review and send"] as const;
type Step = 1 | 2 | 3;

type Draft = { values: Values; phone?: string; savedAt: number };
const draftKey = (category: string) => `qt-booking-draft-v1:${category}`;
function readDraft(category: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(category));
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && d.values && Object.values(d.values).some((v) => (Array.isArray(v) ? v.length : v)) ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(category: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(category), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(category));
  } catch {
    // Private mode or storage full: drafts are a convenience only.
  }
}

// OTP token kept in memory only, with a minute of slack before it expires.
type HeldToken = { value: string; exp: number };
const issuedToken = (value: string, expiresInSeconds: number): HeldToken => ({
  value,
  exp: Date.now() + (expiresInSeconds - 60) * 1000,
});
const isTokenFresh = (t: HeldToken | null) => !!t && t.exp > Date.now();

type TopError = { message: string; retry?: boolean; ref?: string };
type Done = { booking_code: string; waitlisted: boolean };

/** The 3-step booking form shared by every category (docs/specs/booking-forms.md). */
export function BookingWizard({ config }: { config: FormConfig }) {
  const { category } = config;
  const hydrated = useHydrated();
  const { honeypot, bot, waitForMinFill } = useBotCheck();

  // Read once on the client; nothing rendered depends on it before hydration.
  const [initialDraft] = useState<Draft | null>(() => (typeof window === "undefined" ? null : readDraft(category)));
  const [draftPrompt, setDraftPrompt] = useState(initialDraft !== null);

  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<Values>(config.initialValues ?? {});
  const [phone, setPhone] = useState<string | null>(null);
  const [verifyPhone, setVerifyPhone] = useState<string | undefined>(undefined);
  const token = useRef<HeldToken | null>(null);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState<{ 2: boolean; 3: boolean }>({ 2: false, 3: false });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState<Consents>({ consent_terms: false, consent_messages: false, consent_rules: false });

  const [brief, setBrief] = useState<FileState>({ status: "idle" });
  const briefFile = useRef<File | null>(null);

  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [topError, setTopError] = useState<TopError | null>(null);
  const [duplicate, setDuplicate] = useState<string | null | undefined>(undefined);
  // Rate limited: Send stays disabled for this many ms (then a timer re-enables it).
  const [blockedMs, setBlockedMs] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  const [reverify, setReverify] = useState<(() => void) | null>(null);

  const focusTarget = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Save the draft as the visitor types (never files or the OTP token).
  useEffect(() => {
    if (!hydrated || draftPrompt || done) return;
    if (Object.keys(values).length === 0) return;
    writeDraft(category, { values, phone: phone ?? verifyPhone, savedAt: Date.now() });
  }, [hydrated, draftPrompt, done, values, phone, verifyPhone, category]);

  // Move focus after a render (error summary, Edit links, step changes).
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const el = target === "top" ? topRef.current : document.getElementById(target);
    el?.scrollIntoView({ behavior: "smooth", block: target === "top" ? "start" : "center" });
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  });

  // Re-enable Send once a rate limit has passed.
  useEffect(() => {
    if (blockedMs <= 0) return;
    const t = setTimeout(() => setBlockedMs(0), blockedMs);
    return () => clearTimeout(t);
  }, [blockedMs]);

  const detailsParse = useMemo(
    () => parseBooking(toPayload(category, values, phone ?? "", {}, brief.status === "done" ? brief.path : undefined), "details"),
    [category, values, phone, brief],
  );
  const sendParse = useMemo(
    () => parseBooking(toPayload(category, values, phone ?? "", consents, brief.status === "done" ? brief.path : undefined), "send"),
    [category, values, phone, consents, brief],
  );
  const detailErrors = useMemo(
    () => ({ ...(detailsParse.success ? {} : errorsByKey(detailsParse.error)), ...serverErrors }),
    [detailsParse, serverErrors],
  );
  const sendErrors = useMemo(() => (sendParse.success ? {} : errorsByKey(sendParse.error)), [sendParse]);
  // The review shows answers as they will be stored (trimmed, spaces collapsed, GSTIN upper case).
  const reviewValues = useMemo<Values>(() => {
    if (!detailsParse.success) return values;
    const parsed = detailsParse.data as Record<string, unknown> & { details: Record<string, unknown> };
    const out: Values = { ...values };
    for (const [k, v] of Object.entries({ ...parsed, ...parsed.details })) if (typeof v === "string") out[k] = v;
    return out;
  }, [detailsParse, values]);

  const order = detailFieldOrder(config, values);
  // Errors show once a field has been left, or for every field after a failed Continue.
  const shownError = (key: string) => (attempted[2] || touched.has(key) ? detailErrors[key] : undefined);

  const setValue = (key: string, value: Values[string]) => {
    setValues((prev) => applyChange(category, prev, key, value));
    if (serverErrors[key]) {
      setServerErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };
  const touch = (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const ctx: SectionContext = { values, setValue, error: shownError, touch };

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------
  function goTo(next: Step, focus = "top") {
    setStep(next);
    focusTarget.current = focus;
  }

  function onVerified(t: string, verified: string, expiresIn: number) {
    token.current = issuedToken(t, expiresIn);
    setPhone(verified);
    setVerifyPhone(verified);
    const after = reverify;
    setReverify(null);
    if (after) after();
    else goTo(2);
  }

  const tokenValid = () => isTokenFresh(token.current);

  function continueToReview() {
    setAttempted((a) => ({ ...a, 2: true }));
    const firstBad = order.find((f) => detailErrors[f.key]);
    if (firstBad) {
      focusTarget.current = fieldId(firstBad.key);
      return;
    }
    if (brief.status === "uploading") return;
    goTo(3);
  }

  async function startUpload(file: File) {
    briefFile.current = file;
    const problem = checkUploadFile(file);
    if (problem) {
      setBrief({ status: "error", name: file.name, message: UPLOAD_MESSAGES[problem], canRetry: false });
      return;
    }
    if (!tokenValid()) {
      setReverify(() => () => void startUpload(file));
      return;
    }
    setBrief({ status: "uploading", name: file.name });
    const res = await uploadFile(file, "brief", token.current!.value);
    if (res.ok) setBrief({ status: "done", name: file.name, size: file.size, path: res.path });
    else if (res.reason === "auth") setReverify(() => () => void startUpload(file));
    else setBrief({ status: "error", name: file.name, message: res.message, canRetry: res.reason === "failed" });
  }

  async function send() {
    if (sendingRef.current) return;
    setAttempted({ 2: true, 3: true });
    if (!sendParse.success) {
      const errs = sendErrors;
      const detailBad = order.find((f) => errs[f.key]);
      if (detailBad) {
        goTo(2, fieldId(detailBad.key));
        return;
      }
      const consentBad = (["consent_terms", "consent_messages", "consent_rules"] as const).find((k) => errs[k]);
      if (consentBad) focusTarget.current = fieldId(consentBad);
      return;
    }
    if (!tokenValid()) {
      setReverify(() => () => void send());
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setTopError(null);
    await waitForMinFill();
    const res = await postJson<Done & { status: string }>("/api/bookings", {
      token: token.current!.value,
      booking: sendParse.data,
      bot: bot(),
    });
    sendingRef.current = false;
    setSending(false);

    if (res.ok) {
      writeDraft(category, null);
      setDone({ booking_code: res.data.booking_code, waitlisted: res.data.waitlisted });
      window.scrollTo({ top: 0 });
      return;
    }
    const e = res.error;
    switch (e.error) {
      case "duplicate":
        setDuplicate((e.booking_code as string | null) ?? null);
        return;
      case "otp_required":
        token.current = null;
        setReverify(() => () => void send());
        return;
      case "meetup_closed":
        setValues((prev) => applyChange(category, prev, "event_id", undefined));
        setTopError({ message: e.message });
        config.onMeetupClosed?.();
        goTo(2, "top");
        return;
      case "rate_limited":
        setTopError({ message: e.message });
        setBlockedMs(Number(e.retry_after ?? 600) * 1000);
        focusTarget.current = "top";
        return;
      case "network":
        setTopError({
          message: "You seem to be offline. Your answers are saved — try again when you're back online.",
          retry: true,
        });
        focusTarget.current = "top";
        return;
      case "server_error":
        setTopError({ message: e.message, retry: true, ref: e.ref as string | undefined });
        focusTarget.current = "top";
        return;
      case "invalid": {
        const byKey = errorsByKey(e.fields ?? {});
        setServerErrors(byKey);
        const bad = order.find((f) => byKey[f.key]);
        if (bad) goTo(2, fieldId(bad.key));
        else setTopError({ message: e.message });
        return;
      }
      default:
        setTopError({ message: e.message, retry: e.error === "http" });
        focusTarget.current = "top";
    }
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (!hydrated) {
    return <Shell>{<p className="text-sm text-neutral-500">Loading the form…</p>}</Shell>;
  }

  if (done) return <Success category={category} done={done} />;

  if (draftPrompt && initialDraft) {
    return (
      <Shell>
        <h2 className="text-base font-semibold text-neutral-900">Continue where you left off?</h2>
        <p className="text-sm text-neutral-600">We saved the answers you typed on this device.</p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              setValues(initialDraft.values);
              setVerifyPhone(initialDraft.phone);
              setDraftPrompt(false);
            }}
          >
            Continue
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              writeDraft(category, null);
              setDraftPrompt(false);
            }}
          >
            Start over
          </Button>
        </div>
      </Shell>
    );
  }

  const summaryItems =
    step === 2 && attempted[2]
      ? order.filter((f) => detailErrors[f.key]).map((f) => ({ id: fieldId(f.key), label: f.label, message: detailErrors[f.key] }))
      : step === 3 && attempted[3]
        ? (["consent_terms", "consent_messages", "consent_rules"] as const)
            .filter((k) => sendErrors[k])
            .map((k) => ({ id: fieldId(k), label: "", message: sendErrors[k] }))
        : [];

  const sendBlocked = blockedMs > 0;

  return (
    <div ref={topRef} tabIndex={-1} className="relative scroll-mt-4 focus:outline-none">
      {honeypot}
      <Shell>
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Step {step} of 3 · {STEP_NAMES[step - 1]}
        </p>

        {topError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{topError.message}</p>
            {topError.ref && <p className="mt-1 text-xs">Reference: {topError.ref}</p>}
            {topError.retry && (
              <button type="button" className="mt-2 font-medium underline" onClick={() => void send()}>
                Try again
              </button>
            )}
          </div>
        )}

        {summaryItems.length > 0 && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Please fix {summaryItems.length === 1 ? "this" : `these ${summaryItems.length} things`}:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {summaryItems.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="underline"
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(item.id);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      el?.focus({ preventScroll: true });
                    }}
                  >
                    {item.label ? `${item.label}: ` : ""}
                    {item.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <PhoneVerify purpose="submit" initialPhone={verifyPhone} onVerified={onVerified} />
        )}

        {step === 2 && (
          <form
            noValidate
            className="space-y-8"
            onSubmit={(e) => {
              e.preventDefault();
              continueToReview();
            }}
          >
            {config.sections.map((s) => {
              if (s.shownWhen && !s.shownWhen(values)) return null;
              return (
                <section
                  key={s.id}
                  id={`s_${s.id}`}
                  tabIndex={-1}
                  aria-labelledby={`s_${s.id}_h`}
                  className="scroll-mt-4 space-y-5 focus:outline-none"
                >
                  <h2 id={`s_${s.id}_h`} className="border-b border-neutral-200 pb-2 text-base font-semibold text-neutral-900">
                    {s.title}
                  </h2>
                  {s.fields?.map((f) =>
                    fieldShown(category, f.key, values) ? (
                      <Field
                        key={f.key}
                        field={f}
                        values={values}
                        error={shownError(f.key)}
                        onChange={(k, v) => {
                          setValue(k, v);
                          if (f.kind === "radio" || f.kind === "chips" || f.kind === "select") touch(k);
                        }}
                        onBlur={touch}
                        phone={phone ?? ""}
                        onChangePhone={() => {
                          token.current = null;
                          setPhone(null);
                          goTo(1);
                        }}
                        file={brief}
                        onFile={(file) => {
                          if (!file) {
                            briefFile.current = null;
                            setBrief({ status: "idle" });
                          } else void startUpload(file);
                        }}
                        onRetryFile={() => briefFile.current && void startUpload(briefFile.current)}
                      />
                    ) : null,
                  )}
                  {s.render?.(ctx)}
                </section>
              );
            })}
            <Button type="submit" disabled={brief.status === "uploading"} className="w-full sm:w-auto">
              {brief.status === "uploading" ? "Uploading…" : "Continue"}
            </Button>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-6">
            {config.sections.map((s) => {
              if (s.shownWhen && !s.shownWhen(values)) return null;
              const rows = reviewRows(config, s.id, reviewValues, phone ?? "", brief);
              if (rows.length === 0) return null;
              return (
                <section key={s.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 border-b border-neutral-200 pb-2">
                    <h2 className="text-base font-semibold text-neutral-900">{s.title}</h2>
                    <button type="button" className="text-sm underline" onClick={() => goTo(2, `s_${s.id}`)}>
                      Edit<span className="sr-only"> {s.title}</span>
                    </button>
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
                    {rows.map(([label, value]) => (
                      <Fragment key={label}>
                        <dt className="text-neutral-500">{label}</dt>
                        <dd className="break-words whitespace-pre-line text-neutral-900">{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </section>
              );
            })}

            <div className="space-y-3 border-t border-neutral-200 pt-5">
              <Consent
                id="consent_terms"
                label={
                  <>
                    I agree to the <Link href="/terms" className="underline">Terms</Link>,{" "}
                    <Link href="/privacy" className="underline">Privacy Policy</Link> and{" "}
                    <Link href="/refund-policy" className="underline">Refund Policy</Link>.
                  </>
                }
                checked={consents.consent_terms}
                onChange={(v) => setConsents((c) => ({ ...c, consent_terms: v }))}
                error={attempted[3] ? sendErrors.consent_terms : undefined}
              />
              <Consent
                id="consent_messages"
                label={CONSENT_LABELS.consent_messages}
                checked={consents.consent_messages}
                onChange={(v) => setConsents((c) => ({ ...c, consent_messages: v }))}
                error={attempted[3] ? sendErrors.consent_messages : undefined}
              />
              {config.extraConsent && (
                <Consent
                  id="consent_rules"
                  label={config.extraConsent.label}
                  checked={consents.consent_rules}
                  onChange={(v) => setConsents((c) => ({ ...c, consent_rules: v }))}
                  error={attempted[3] ? sendErrors.consent_rules : undefined}
                />
              )}
            </div>

            {duplicate !== undefined ? (
              <div role="alert" className="space-y-3 rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-800">
                <p>
                  You already have an open request{duplicate ? ` (${duplicate})` : ""}. You can track it or wait for it to
                  close before sending a new one.
                </p>
                <Link
                  href={duplicate ? `/track?code=${duplicate}` : "/track"}
                  className="inline-flex rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Track it
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void send()} disabled={sending || sendBlocked} className="w-full sm:w-auto">
                  {sending ? "Sending…" : "Send request"}
                </Button>
                <button type="button" className="text-sm underline" onClick={() => goTo(2)}>
                  Back to details
                </button>
              </div>
            )}
          </div>
        )}
      </Shell>

      {reverify && phone && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reverify_title"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 id="reverify_title" className="text-base font-semibold text-neutral-900">
              For your security, please verify your number again.
            </h2>
            <PhoneVerify purpose="submit" initialPhone={phone} lockPhone onVerified={onVerified} />
            <button type="button" className="text-sm underline" onClick={() => setReverify(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">{children}</section>;
}

function Consent({
  id,
  label,
  checked,
  onChange,
  error,
}: {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-3 text-sm text-neutral-800">
        <input
          id={fieldId(id)}
          type="checkbox"
          checked={checked}
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId(id)}_error` : undefined}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-neutral-900"
        />
        <span>
          {label}
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        </span>
      </label>
      {error && (
        <p id={`${fieldId(id)}_error`} className="mt-1 pl-7 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Label/value rows for one section; empty optional fields are left out. */
function reviewRows(config: FormConfig, sectionId: string, values: Values, phone: string, brief: FileState) {
  const section = config.sections.find((s) => s.id === sectionId)!;
  const rows: [string, ReactNode][] = [...(section.review?.(values) ?? [])];
  for (const f of section.fields ?? []) {
    if (!fieldShown(config.category, f.key, values)) continue;
    const shown = displayValue(f, values, phone, brief);
    if (shown) rows.push([f.label, shown]);
  }
  return rows;
}

function displayValue(f: FieldDef, values: Values, phone: string, brief: FileState): string | null {
  if (f.kind === "verified-phone") return phone;
  if (f.kind === "file") return brief.status === "done" ? brief.name : null;
  return formatAnswer(f, values[f.key]);
}

function Success({ category, done }: { category: FormConfig["category"]; done: Done }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Shell>
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
        {done.waitlisted ? "You're on the waitlist" : "Request sent"}
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-3xl font-semibold tracking-wide text-neutral-900 sm:text-4xl">{done.booking_code}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(done.booking_code);
              setCopied(true);
            } catch {
              // Clipboard blocked: the ID is on screen to copy by hand.
            }
          }}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <p className="text-sm text-neutral-700">
        We&apos;ve also sent this to your WhatsApp and email. Keep it to track your request.
      </p>
      {done.waitlisted && (
        <p className="text-sm text-neutral-700">
          This meetup is full right now. If a seat opens up, we&apos;ll message you in the order requests arrived.
        </p>
      )}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">What happens next</h3>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-neutral-700">
          <li>Our team reviews your request ({CATEGORY_INFO[category].response.toLowerCase()}).</li>
          <li>If approved, you&apos;ll get payment details on WhatsApp and email.</li>
          <li>Your booking is confirmed once payment is verified.</li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/track?code=${done.booking_code}`}
          className="inline-flex rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Track this request
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          Back to home
        </Link>
      </div>
    </Shell>
  );
}
