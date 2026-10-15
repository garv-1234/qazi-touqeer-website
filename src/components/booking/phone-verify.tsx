"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { normalizePhone, type OtpPurpose } from "@/lib/validation";
import { useBotCheck } from "./bot-check";

const noopSubscribe = () => () => {};
/** False in the server HTML and until React hydrates, then true. */
const useHydrated = () =>
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
  onVerified: (token: string, phone: string) => void;
};

/** FR-B5: verify the WhatsApp number with a 6-digit code. */
export function PhoneVerify({ purpose, bookingCode, validate, onVerified }: Props) {
  const { honeypot, bot, waitForMinFill } = useBotCheck();
  const hydrated = useHydrated();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string>();

  async function send() {
    setError(null);
    setPhoneError(undefined);
    const problem = validate?.();
    if (problem) return setError(problem);
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
    if (!res.ok) return setError(res.error.message);
    setSentTo(normalized);
    setCode("");
    setDevCode(res.data.dev_code ?? null);
  }

  async function verify() {
    if (!sentTo) return;
    setError(null);
    setBusy(true);
    const res = await postJson<{ token: string; phone: string }>("/api/otp/verify", {
      phone: sentTo,
      purpose,
      code,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    onVerified(res.data.token, res.data.phone);
  }

  // Why "Send code" is disabled, shown under the button.
  const phoneValid = normalizePhone(phone) !== null;
  const sendBlockedReason = !hydrated
    ? "Loading the form… If this doesn't go away, reload the page."
    : busy
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
            hint="Indian numbers need no code. Outside India, start with + and your country code."
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={phoneError}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div>
            <Button
              type="submit"
              disabled={busy || sendBlockedReason !== null}
              aria-describedby={sendBlockedReason ? "otp_send_reason" : undefined}
              className="w-full sm:w-auto"
            >
              {busy ? "Sending…" : "Send code"}
            </Button>
            {sendBlockedReason && (
              <p id="otp_send_reason" data-send-hint className="mt-2 text-xs text-neutral-500">
                {sendBlockedReason}
              </p>
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
          {devCode && <Notice>Development mode, no SMS sent. Your code is {devCode}.</Notice>}
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
          />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void send()}>
              Resend code
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setSentTo(null)}>
              Change number
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
