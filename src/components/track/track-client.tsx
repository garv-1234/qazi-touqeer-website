"use client";

import { useState } from "react";
import { PhoneVerify } from "@/components/booking/phone-verify";
import { Button, Card, Notice, SelectField, TextAreaField, TextField } from "@/components/ui";
import { formatDate, formatDateTimeIST, formatRupees } from "@/lib/booking/events";
import type { TrackView } from "@/lib/booking/server";
import { file, num, postJson, str, uploadFile } from "@/lib/client/api";
import { bookingCodeSchema, fieldErrors, paymentSubmitSchema, todayIST } from "@/lib/validation";

type Session = { token: string; code: string };

/** FR-W7 Track My Booking: Booking ID + phone OTP, then status and actions. */
export function TrackClient({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<TrackView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(token: string, bookingCode: string) {
    setError(null);
    const res = await postJson<{ booking: TrackView }>("/api/track", { token, booking_code: bookingCode });
    if (!res.ok) {
      setError(res.error.message);
      if (res.error.error === "otp_required") setSession(null);
      return;
    }
    setSession({ token, code: bookingCode });
    setView(res.data.booking);
  }

  if (!session || !view) {
    return (
      <Card title="Find your booking">
        <TextField
          label="Booking ID"
          name="booking_code"
          placeholder="QT-2610-0042"
          autoCapitalize="characters"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <PhoneVerify
          purpose="track"
          bookingCode={code.trim()}
          validate={() => (bookingCodeSchema.safeParse(code).success ? null : "Enter your Booking ID, e.g. QT-2610-0042")}
          onVerified={(token) => void load(token, code.trim())}
        />
        {error && <Notice tone="error">{error}</Notice>}
      </Card>
    );
  }

  return <BookingStatus view={view} session={session} onChange={setView} onExpired={() => setSession(null)} />;
}

function BookingStatus({
  view,
  session,
  onChange,
  onExpired,
}: {
  view: TrackView;
  session: Session;
  onChange: (v: TrackView) => void;
  onExpired: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(url: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    const res = await postJson<{ booking: TrackView }>(url, {
      token: session.token,
      booking_code: session.code,
      ...body,
    });
    setBusy(false);
    if (res.ok) {
      onChange(res.data.booking);
      return null;
    }
    if (res.error.error === "otp_required") onExpired();
    setError(res.error.message);
    return res.error.fields ?? {};
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-sm text-neutral-600">{view.booking_code}</p>
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
            {view.status_label}
          </span>
        </div>
        <p className="text-lg font-semibold text-neutral-900">{view.category_label}</p>
        <p className="text-sm text-neutral-700">{view.next_step}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">Requested</dt>
          <dd>{formatDateTimeIST(view.created_at)}</dd>
          {view.event ? (
            <>
              <dt className="text-neutral-500">Meetup</dt>
              <dd>
                {view.event.title}, {view.event.venue}, {view.event.city} · {formatDateTimeIST(view.event.starts_at)}
              </dd>
              <dt className="text-neutral-500">People</dt>
              <dd>{view.party_size}</dd>
            </>
          ) : (
            view.preferred_date && (
              <>
                <dt className="text-neutral-500">Date</dt>
                <dd>{formatDate(view.preferred_date)}</dd>
              </>
            )
          )}
        </dl>
      </Card>

      {view.last_payment?.status === "rejected" && view.status === "payment_pending" && (
        <Notice tone="error">
          Your payment with reference ending {view.last_payment.utr_last4} could not be verified
          {view.last_payment.reject_reason ? `: ${view.last_payment.reject_reason}` : ""}. Please check and submit
          again.
        </Notice>
      )}

      {view.payment && <PaymentDetails payment={view.payment} />}
      {view.can_pay && view.payment && (
        <PaymentForm
          amountDue={view.payment.amount}
          busy={busy}
          token={session.token}
          bookingCode={session.code}
          onSubmit={(body) => act("/api/track/payment", body)}
        />
      )}

      {view.can_reply && (
        <ReplyForm
          question={view.info_request?.question ?? null}
          busy={busy}
          onSubmit={(message) => act("/api/track/reply", { message })}
        />
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {view.can_cancel && (
        <Card title="Cancel this request">
          <p className="text-sm text-neutral-600">You can cancel any time before you pay.</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this booking? This can't be undone.")) void act("/api/track/cancel", {});
            }}
          >
            Cancel booking
          </Button>
        </Card>
      )}
    </div>
  );
}

function PaymentDetails({ payment }: { payment: NonNullable<TrackView["payment"]> }) {
  return (
    <Card title="Pay the advance">
      {payment.overdue && <Notice tone="error">The payment deadline has passed. Please pay now or contact us.</Notice>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Amount</dt>
        <dd className="font-semibold">{payment.amount !== null ? formatRupees(payment.amount) : "To be confirmed"}</dd>
        {payment.deadline && (
          <>
            <dt className="text-neutral-500">Pay by</dt>
            <dd>{formatDateTimeIST(payment.deadline)}</dd>
          </>
        )}
        <dt className="text-neutral-500">Reference</dt>
        <dd className="font-mono">{payment.reference}</dd>
        {payment.upi_id && (
          <>
            <dt className="text-neutral-500">UPI ID</dt>
            <dd className="font-mono">{payment.upi_id}</dd>
          </>
        )}
        {payment.bank && (
          <>
            <dt className="text-neutral-500">Bank</dt>
            <dd>
              {payment.bank.account_name}
              <br />
              A/c {payment.bank.account_number} · IFSC {payment.bank.ifsc}
              {payment.bank.bank_name && (
                <>
                  <br />
                  {payment.bank.bank_name}
                </>
              )}
            </dd>
          </>
        )}
      </dl>
      {payment.upi_qr_url && (
        // Short-lived signed URL from private storage; next/image would cache it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={payment.upi_qr_url} alt="UPI QR code" className="size-48 rounded-lg border" />
      )}
      {!payment.upi_id && !payment.bank && (
        <Notice>Payment details will be shared shortly. Please check back or wait for our message.</Notice>
      )}
      <p className="text-xs text-neutral-500">Use your Booking ID as the payment reference or note.</p>
    </Card>
  );
}

function PaymentForm({
  amountDue,
  busy,
  token,
  bookingCode,
  onSubmit,
}: {
  amountDue: number | null;
  busy: boolean;
  token: string;
  bookingCode: string;
  onSubmit: (body: Record<string, unknown>) => Promise<Record<string, string> | null>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  async function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const body = {
      token,
      booking_code: bookingCode,
      method: str(fd, "method"),
      utr: str(fd, "utr") ?? "",
      amount_paid: num(fd, "amount_paid"),
      paid_on: str(fd, "paid_on"),
    };
    const parsed = paymentSubmitSchema.safeParse(body);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});

    let screenshot_path: string | undefined;
    const shot = file(fd, "screenshot");
    if (shot) {
      setUploading(true);
      const up = await uploadFile(shot, "payment_screenshot", token, bookingCode);
      setUploading(false);
      if (!up.ok) return setErrors({ screenshot_path: up.message });
      screenshot_path = up.path;
    }
    const fieldErrs = await onSubmit({ ...parsed.data, screenshot_path });
    if (fieldErrs) setErrors(fieldErrs);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <Card title="I've paid: submit the reference">
        <SelectField
          label="Paid by"
          name="method"
          options={{ upi: "UPI", bank_transfer: "Bank transfer (NEFT/IMPS/RTGS)" }}
          required
          error={errors.method}
        />
        <TextField
          label="UTR / reference number"
          name="utr"
          autoCapitalize="characters"
          hint="UPI: the 12-digit UTR in your payment app. Bank: the transfer reference."
          required
          error={errors.utr}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Amount paid (₹)"
            name="amount_paid"
            type="number"
            inputMode="decimal"
            min={1}
            defaultValue={amountDue ?? undefined}
            required
            error={errors.amount_paid}
          />
          <TextField
            label="Payment date"
            name="paid_on"
            type="date"
            max={todayIST()}
            defaultValue={todayIST()}
            required
            error={errors.paid_on}
          />
        </div>
        <TextField
          label="Screenshot"
          name="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          hint="Optional. Image or PDF, up to 10 MB."
          error={errors.screenshot_path}
        />
        <Button type="submit" disabled={busy || uploading}>
          {uploading ? "Uploading…" : busy ? "Submitting…" : "Submit payment"}
        </Button>
      </Card>
    </form>
  );
}

function ReplyForm({
  question,
  busy,
  onSubmit,
}: {
  question: string | null;
  busy: boolean;
  onSubmit: (message: string) => Promise<Record<string, string> | null>;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (message.trim().length < 2) return setError("Write your reply");
        const errs = await onSubmit(message.trim());
        setError(errs?.message);
      }}
    >
      <Card title="We need more information">
        {question && <blockquote className="border-l-2 border-neutral-300 pl-3 text-sm text-neutral-700">{question}</blockquote>}
        <TextAreaField
          label="Your reply"
          name="message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={error}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send reply"}
        </Button>
      </Card>
    </form>
  );
}
