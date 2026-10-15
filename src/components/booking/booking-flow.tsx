"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, Card, CheckboxField, Notice, SelectField, TextField } from "@/components/ui";
import { CATEGORY_INFO, type CategoryCode } from "@/lib/booking/categories";
import { checked, file, postJson, str, uploadFile } from "@/lib/client/api";
import { bookingSchema, fieldErrors, SOURCE_LABELS, todayIST } from "@/lib/validation";
import { useBotCheck } from "./bot-check";
import { PhoneVerify } from "./phone-verify";

export type Errors = Record<string, string>;

type Props = {
  category: CategoryCode;
  /** Reads the category-specific answers from the form. */
  buildDetails: (fd: FormData) => Record<string, unknown>;
  /** Category-specific fields. */
  children: (errors: Errors) => ReactNode;
  /** Label for the main date; null hides the date fields (meetups use the event date). */
  dateLabel?: string | null;
  /** File input name to upload as the brief before submitting (misc events). */
  briefInput?: string;
  submitLabel?: string;
};

type Done = { booking_code: string; waitlisted: boolean };

/** OTP first, then the form, then the Booking ID (FR-B1, FR-B5, FR-B6, FR-B7). */
export function BookingFlow({
  category,
  buildDetails,
  children,
  dateLabel = "Preferred date",
  briefInput,
  submitLabel = "Submit request",
}: Props) {
  const { honeypot, bot } = useBotCheck();
  const [verified, setVerified] = useState<{ token: string; phone: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [duplicate, setDuplicate] = useState<string | null | undefined>(undefined);

  if (done) {
    return (
      <Card>
        <Notice tone="success">
          {done.waitlisted ? "You're on the waitlist." : "Request received."} Your Booking ID is{" "}
          <strong className="font-mono">{done.booking_code}</strong>.
        </Notice>
        <p className="text-sm text-neutral-700">
          {done.waitlisted
            ? "This meetup is full right now. If a seat frees up we'll message you on WhatsApp/SMS and email."
            : `We'll reply ${CATEGORY_INFO[category].response.toLowerCase()} on WhatsApp/SMS and email.`}{" "}
          Keep your Booking ID to track the request.
        </p>
        <Link href={`/track?code=${done.booking_code}`} className="text-sm font-medium underline">
          Track my booking
        </Link>
      </Card>
    );
  }

  if (duplicate !== undefined) {
    return (
      <Card>
        <Notice>
          You already have an open {CATEGORY_INFO[category].label.toLowerCase()} request
          {duplicate ? (
            <>
              {" "}
              (<strong className="font-mono">{duplicate}</strong>)
            </>
          ) : null}
          . We&apos;ll get back to you on it; you can track it any time.
        </Notice>
        <Link href={duplicate ? `/track?code=${duplicate}` : "/track"} className="text-sm font-medium underline">
          Track my booking
        </Link>
      </Card>
    );
  }

  if (!verified) {
    return (
      <Card title="Step 1 of 2 · Verify your WhatsApp number">
        <PhoneVerify purpose="submit" onVerified={(token, phone) => setVerified({ token, phone })} />
      </Card>
    );
  }

  async function onSubmit(form: HTMLFormElement) {
    if (!verified) return;
    setMessage(null);
    const fd = new FormData(form);
    const details = buildDetails(fd);
    const parsed = bookingSchema.safeParse({
      category,
      name: str(fd, "name"),
      phone: verified.phone,
      email: str(fd, "email"),
      city: str(fd, "city"),
      preferred_date: str(fd, "preferred_date"),
      backup_date: str(fd, "backup_date"),
      source: str(fd, "source"),
      consent_policies: checked(fd, "consent_policies"),
      consent_messages: checked(fd, "consent_messages"),
      details,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMessage("Please check the highlighted fields.");
      return;
    }
    setErrors({});
    setBusy(true);

    const booking = parsed.data;
    const brief = briefInput ? file(fd, briefInput) : undefined;
    if (brief && booking.category === "misc_event") {
      const up = await uploadFile(brief, "brief", verified.token);
      if (!up.ok) {
        setBusy(false);
        setErrors({ "details.brief_path": up.message });
        setMessage(up.message);
        return;
      }
      booking.details.brief_path = up.path;
    }

    const res = await postJson<Done>("/api/bookings", { token: verified.token, booking, bot: bot() });
    setBusy(false);
    if (res.ok) return setDone(res.data);
    if (res.error.error === "duplicate") return setDuplicate((res.error.booking_code as string | null) ?? null);
    if (res.error.error === "otp_required") {
      setVerified(null);
      return;
    }
    setErrors(res.error.fields ?? {});
    setMessage(res.error.message);
  }

  const today = todayIST();

  return (
    <form
      noValidate
      className="relative space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(e.currentTarget);
      }}
    >
      {honeypot}
      <Card title="Step 2 of 2 · Your details">
        <p className="text-sm text-neutral-600">
          Verified number: <span className="font-medium text-neutral-900">{verified.phone}</span>{" "}
          <button type="button" className="underline" onClick={() => setVerified(null)}>
            change
          </button>
        </p>
        <TextField label="Full name" name="name" autoComplete="name" required error={errors.name} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required error={errors.email} />
        <TextField label="Your city" name="city" autoComplete="address-level2" required error={errors.city} />
        {dateLabel !== null && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={dateLabel}
              name="preferred_date"
              type="date"
              min={today}
              required
              error={errors.preferred_date}
            />
            <TextField label="Backup date" name="backup_date" type="date" min={today} error={errors.backup_date} />
          </div>
        )}
        <SelectField
          label="How did you hear of Qazi?"
          name="source"
          options={SOURCE_LABELS}
          required
          error={errors.source}
        />
      </Card>

      {children(errors)}

      <Card>
        <CheckboxField
          name="consent_policies"
          error={errors.consent_policies}
          label={
            <>
              I agree to the <Link href="/terms" className="underline">Terms</Link>,{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link> and{" "}
              <Link href="/refund-policy" className="underline">Refund and Cancellation Policy</Link>.
            </>
          }
        />
        <CheckboxField
          name="consent_messages"
          error={errors.consent_messages}
          label="I agree to receive updates about this request on WhatsApp, SMS and email."
        />
        {message && <Notice tone="error">{message}</Notice>}
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Submitting…" : submitLabel}
        </Button>
      </Card>
    </form>
  );
}
