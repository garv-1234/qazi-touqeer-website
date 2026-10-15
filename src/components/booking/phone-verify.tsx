"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, TextField } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { normalizePhone, type OtpPurpose } from "@/lib/validation";
import { useBotCheck } from "./bot-check";

const noopSubscribe = () => () => {};
/** False in the server HTML and until React hydrates, then true. */
export const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

type Props = {
  purpose: OtpPurpose;
  /** Track only: the Booking ID the code is for. */
  bookingCode?: string;
  /** Return an error message to stop the send (e.g. missing Booking ID). */
  validate?: () => string | null;
  /** Number to start with (e.g. from a saved draft). */
  initialPhone?: string;
  /** Re-verifying a known number: show it read-only. */
  lockPhone?: boolean;
  /** Called with the token and its lifetime in seconds. */
  onVerified: (token: string, phone: string, expiresIn: number) => void;
};

/** FR-B5: verify the WhatsApp number with a 6-digit code. */
export function PhoneVerify({ purpose, bookingCode, validate, initialPhone, lockPhone, onVerified }: Props) {
  const { honeypot, bot, waitForMinFill } = useBotCheck();
  const hydrated = useHydrated();
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendLocked, setSendLocked] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLocked, setCodeLocked] = useState(false);
  const [phoneError, setPhoneError] = useState<string>();

  async function send() {
    setSendError(null);
    setPhoneError(undefined);
    const problem = validate?.();
    if (problem) return setSendError(problem);
    const normalized = normalizePhone(phone);
    if (!normalized) return setPhoneError("Enter a valid mobile number (add the country code if not Indian)");

    setBusy(true);
    await waitForMinFill(); // a very quick click would otherwise fail the server's bot check
    const res = await postJson<{ ok: true; dev_code?: string }>("/api/otp/send", {
      phone: normalized,
      purpose,
      booking_code: bookingCode,
      bot: bot(),
    });
    setBusy(false);
    if (!res.ok) {
      setSendError(res.error.message);
      if (res.status === 429) setSendLocked(true);
      return;
    }
    setSentTo(normalized);
    setCode("");
    setCodeError(null);
    setCodeLocked(false);
    setDevCode(res.data.dev_code ?? null);
  }

  async function verify() {
    if (!sentTo) return;
    setCodeError(null);
    setBusy(true);
    const res = await postJson<{ token: string; phone: string; expires_in: number }>("/api/otp/verify", {
      phone: sentTo,
      purpose,
      code,
    });
    setBusy(false);
    if (!res.ok) {
      setCodeError(res.error.message);
      if (res.error.error === "otp_locked" || res.error.error === "otp_expired" || res.error.error === "otp_missing") {
        setCodeLocked(true);
      }
      return;
    }
    onVerified(res.data.token, res.data.phone, res.data.expires_in);
  }

  // Why "Send code" is disabled, shown under the button.
  const phoneValid = normalizePhone(phone) !== null;
  const sendBlockedReason = !hydrated
    ? "Loading the form… If this doesn't go away, reload the page."
    : busy || sendLocked
      ? null
      : phone.trim() === ""
        ? "Enter your mobile number to get a code."
        : !phoneValid
          ? "Enter a 10-digit Indian mobile number, or + and the country code for other countries."
          : null;

  return (
    <div className="relative space-y-4">
      {honeypot}
      {!sentTo ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <TextField
            label="WhatsApp number"
            name="otp_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            hint="We'll send booking updates here."
            required
            readOnly={lockPhone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={phoneError}
          />
          <div>
            <Button
              type="submit"
              disabled={busy || sendLocked || sendBlockedReason !== null}
              aria-describedby={sendError ? "otp_send_error" : sendBlockedReason ? "otp_send_reason" : undefined}
              className="w-full sm:w-auto"
            >
              {busy ? "Sending…" : "Send code"}
            </Button>
            {sendError ? (
              <p id="otp_send_error" role="alert" className="mt-2 text-sm text-red-600">
                {sendError}
              </p>
            ) : (
              sendBlockedReason && (
                <p id="otp_send_reason" data-send-hint className="mt-2 text-xs text-neutral-500">
                  {sendBlockedReason}
                </p>
              )
            )}
          </div>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="text-sm text-neutral-700">
            {purpose === "track"
              ? `If this Booking ID belongs to ${sentTo}, we've sent it a 6-digit code.`
              : `We've sent a 6-digit code to ${sentTo}.`}{" "}
            It&apos;s valid for 10 minutes.
          </p>
          {devCode && (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
              Development mode, no SMS sent. Your code is <strong className="font-mono">{devCode}</strong>.
            </p>
          )}
          <TextField
            label="Code"
            name="otp_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            error={codeError ?? undefined}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || codeLocked || code.length !== 6}>
              {busy ? "Checking…" : "Verify"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy || sendLocked} onClick={() => void send()}>
              Resend code
            </Button>
            {!lockPhone && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setSentTo(null)}>
                Change number
              </Button>
            )}
          </div>
          {sendError && (
            <p role="alert" className="text-sm text-red-600">
              {sendError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
