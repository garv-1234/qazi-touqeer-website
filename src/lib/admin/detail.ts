import "server-only";
import { miscEventConfig } from "@/components/booking/forms/misc-event.config";
import { whoIsComingFields } from "@/components/booking/forms/fan-meetup.config";
import { podcastConfig } from "@/components/booking/forms/podcast.config";
import { yourDetailsSection } from "@/components/booking/forms/common";
import { formatAnswer } from "@/components/booking/wizard/display";
import type { FieldDef, SectionDef, Values } from "@/components/booking/wizard/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_INFO, type CategoryCode } from "@/lib/booking/categories";
import { STATUS_LABELS, type BookingStatus } from "@/lib/booking/status";
import { isShown, optionLabel, SOURCE_OPTIONS, todayIST } from "@/lib/validation";
import { availableActions, defaultAdvance, defaultDeadline, type AvailableAction } from "./actions";
import type { StaffSession } from "./auth";
import { isRestricted, type FlagCode } from "./flags";
import { formatRupees, formatShortIST, formatUntil, maskEmail, maskPhone } from "./format";
import { contactMasked, seesPayments } from "./roles";

const BUCKET = "booking-files";
const REQUESTER_PANEL_KEYS = new Set(["name", "phone", "email", "city", "source"]);

export type AnswerRow = { label: string; text: string; kind: "text" | "chips" | "link" | "multiline"; items?: string[] };
export type AnswerSection = { title: string; rows: AnswerRow[] };

function sectionsFor(category: CategoryCode): SectionDef[] {
  if (category === "podcast") return podcastConfig.sections;
  if (category === "misc_event") return miscEventConfig.sections;
  return [yourDetailsSection(), { id: "who", title: "Who's coming", fields: whoIsComingFields }];
}

function answerRow(f: FieldDef, v: Values[string], maskContacts: boolean): AnswerRow | null {
  if (f.kind === "file" || f.kind === "verified-phone") return null;
  const text = formatAnswer(f, v);
  if (!text) return null;
  if (f.kind === "chips") return { label: f.label, text, kind: "chips", items: text.split(", ") };
  if (f.kind === "url") return { label: f.label, text, kind: "link" };
  if (f.kind === "textarea") return { label: f.label, text, kind: "multiline" };
  if (f.kind === "phone" && maskContacts) return { label: f.label, text: maskPhone(text), kind: "text" };
  return { label: f.label, text, kind: "text" };
}

type Row = Record<string, unknown> & {
  id: string;
  booking_code: string;
  category: CategoryCode;
  status: BookingStatus;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  source: string | null;
  phone_verified_at: string;
  preferred_date: string | null;
  backup_date: string | null;
  details: Record<string, unknown>;
  event_id: string | null;
  party_size: number;
  budget: string | number | null;
  below_minimum: boolean;
  needs_client_approval: boolean;
  client_decision: "approved" | "declined" | null;
  client_decided_by: string | null;
  client_decided_at: string | null;
  client_note: string | null;
  client_comment: string | null;
  owner_id: string | null;
  advance_amount: string | number | null;
  payment_deadline: string | null;
  deadline_extended: boolean;
  refund_decision: string | null;
  refund_amount: string | number | null;
  created_at: string;
  updated_at: string;
};

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

export async function loadBookingDetail(session: StaffSession, code: string, now: number) {
  const { db, staff } = session;
  // Row-level security decides visibility: a booking outside the person's
  // categories simply isn't found.
  const { data: b } = await db.from("bookings").select("*").eq("booking_code", code.toUpperCase()).maybeSingle<Row>();
  if (!b) return null;

  const admin = createAdminClient();
  const [historyQ, notesQ, messagesQ, attachmentsQ, paymentsQ, eventQ, categoryQ, staffQ, readyQ, seatsQ] = await Promise.all([
    db.from("booking_status_history").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("booking_notes").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
    db.from("message_log").select("id, channel, template, status, error, created_at, audience").eq("booking_id", b.id).order("created_at", { ascending: false }),
    db.from("attachments").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
    db.from("payments").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }),
    b.event_id ? db.from("events").select("id, title, city, venue, starts_at, capacity, ticket_price, status").eq("id", b.event_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("categories").select("advance_type, advance_value, hold_hours, min_budget").eq("code", b.category).maybeSingle(),
    admin.from("staff_profiles").select("user_id, full_name, role, categories, active"),
    admin.rpc("payment_details_ready"),
    b.event_id ? admin.rpc("event_seats_left", { p_event_id: b.event_id }) : Promise.resolve({ data: null }),
  ]);

  const staffRows = staffQ.data ?? [];
  const nameOf = (id: string | null | undefined) => {
    if (!id) return null;
    const s = staffRows.find((r) => r.user_id === id);
    return s ? `${s.full_name}${s.active ? "" : " (deactivated)"}` : "Former staff";
  };
  const masked = contactMasked(staff.role, "detail");

  // Request panel: spec labels and section order, never raw keys.
  const values: Values = {};
  for (const [k, v] of Object.entries(b.details ?? {})) {
    if (typeof v === "string" || Array.isArray(v)) values[k] = v as string | string[];
  }
  if (b.preferred_date) values.preferred_date = b.preferred_date;
  if (b.backup_date) values.backup_date = b.backup_date;
  if (b.budget !== null) values.budget = String(Math.round(Number(b.budget)));
  values.party_size = String(b.party_size);
  const answers: AnswerSection[] = [];
  for (const s of sectionsFor(b.category)) {
    const rows = (s.fields ?? [])
      .filter((f) => !REQUESTER_PANEL_KEYS.has(f.key) && isShown(b.category, f.key, values))
      .map((f) => answerRow(f, values[f.key], masked))
      .filter((r): r is AnswerRow => r !== null);
    if (rows.length) answers.push({ title: s.title, rows });
  }

  const event = eventQ.data
    ? { ...eventQ.data, ticket_price: Number(eventQ.data.ticket_price), seats_left: Math.max(0, Number(seatsQ.data ?? 0)) }
    : null;
  // The meetup's waitlist in arrival order (shown with the event, e.g. after Release slot).
  const waitlist = b.event_id
    ? ((
        await db
          .from("bookings")
          .select("booking_code, name, party_size, created_at")
          .eq("event_id", b.event_id)
          .eq("status", "waitlisted")
          .order("created_at", { ascending: true })
      ).data ?? []).map((w) => ({ code: w.booking_code as string, name: w.name as string, partySize: w.party_size as number }))
    : [];

  // Attachments, with 5-minute thumbnails for images.
  const attachments = await Promise.all(
    (attachmentsQ.data ?? []).map(async (a) => {
      let thumbUrl: string | null = null;
      if (String(a.mime_type).startsWith("image/")) {
        const { data } = await admin.storage.from(BUCKET).createSignedUrl(a.storage_path, 300);
        thumbUrl = data?.signedUrl ?? null;
      }
      return {
        id: a.id as string,
        kind: a.kind as "brief" | "payment_screenshot",
        name: String(a.storage_path).split("/").pop() ?? "file",
        path: a.storage_path as string,
        mime: a.mime_type as string,
        size: a.size_bytes as number,
        createdAt: a.created_at as string,
        thumbUrl,
      };
    }),
  );

  const payments = seesPayments(staff.role)
    ? (paymentsQ.data ?? []).map((p) => ({
        id: p.id as string,
        amountDue: Number(p.amount_due),
        amountPaid: Number(p.amount_paid),
        utr: p.utr as string,
        method: p.method as string,
        paidOn: p.paid_on as string,
        status: p.status as "submitted" | "verified" | "rejected",
        screenshotId: attachments.find((a) => a.path === p.screenshot_path)?.id ?? null,
        verifiedBy: nameOf(p.verified_by),
        verifiedAt: p.verified_at as string | null,
        rejectReason: p.reject_reason as string | null,
        createdAt: p.created_at as string,
      }))
    : null;
  const latestSubmitted = payments?.find((p) => p.status === "submitted") ?? null;

  const timeline = (notesQ.data ?? []).map((n) => ({
    id: n.id as string,
    kind: n.internal ? ("internal" as const) : n.author_type === "requester" ? ("reply" as const) : ("question" as const),
    author: n.author_type === "requester" ? b.name : (nameOf(n.author_id) ?? "Staff"),
    body: n.body as string,
    createdAt: n.created_at as string,
  }));

  const history = (historyQ.data ?? []).map((h) => ({
    from: h.from_status ? STATUS_LABELS[h.from_status as BookingStatus] : null,
    to: STATUS_LABELS[h.to_status as BookingStatus],
    who: h.actor_type === "staff" ? (nameOf(h.actor_id) ?? "Staff") : h.actor_type === "requester" ? "Requester" : "System",
    // Category managers see the amount due only, so payment references are hidden from them here too.
    reason: seesPayments(staff.role) ? (h.reason as string | null) : ((h.reason as string | null)?.replace(/UTR\s+[A-Z0-9]+/gi, "UTR hidden") ?? null),
    createdAt: h.created_at as string,
  }));

  // Flags (same rules as the pipeline)
  const overdue = b.status === "payment_pending" && !!b.payment_deadline && new Date(b.payment_deadline).getTime() < now;
  const lastVisible = [...timeline].reverse().find((t) => t.kind !== "internal");
  const flags: FlagCode[] = [];
  if (overdue) flags.push("overdue");
  if (b.below_minimum) flags.push("below_minimum");
  if (b.needs_client_approval && !b.client_decision) flags.push("needs_client");
  if (b.client_decision === "approved") flags.push("client_approved");
  if (b.client_decision === "declined") flags.push("client_declined");
  if (b.category === "misc_event" && isRestricted(b.details ?? {})) flags.push("restricted");
  if (b.status === "info_requested") flags.push("info_requested");
  if (b.status === "in_review" && lastVisible?.kind === "reply") flags.push("replied");
  if (!b.owner_id && !["completed", "declined", "expired", "cancelled"].includes(b.status)) flags.push("unassigned");

  const datePassed = event
    ? new Date(event.starts_at).getTime() < now
    : !b.preferred_date || b.preferred_date < todayIST();
  const cat = categoryQ.data;
  const actions: AvailableAction[] = availableActions({
    status: b.status,
    role: staff.role,
    overdue,
    deadlineExtended: b.deadline_extended,
    needsClient: b.needs_client_approval,
    clientDecision: b.client_decision,
    paymentDetailsReady: readyQ.data === true,
    seatsLeft: event ? event.seats_left : null,
    partySize: b.party_size,
    datePassed,
    paymentShort: latestSubmitted ? latestSubmitted.amountPaid < latestSubmitted.amountDue : false,
  });

  const advance = num(b.advance_amount);
  const nextStep = (() => {
    switch (b.status) {
      case "submitted":
        return "New request — start a review";
      case "waitlisted":
        return event && event.seats_left >= b.party_size
          ? `On the waitlist — ${event.seats_left} ${event.seats_left === 1 ? "seat is" : "seats are"} free, offer one`
          : "On the waitlist — offer a seat when one frees up";
      case "in_review":
        if (b.needs_client_approval && !b.client_decision) return "Waiting for client sign-off";
        if (b.client_decision === "declined") return "The client declined — decline the request";
        return lastVisible?.kind === "reply" ? "The requester replied — continue the review" : "In review — approve, ask for information or decline";
      case "info_requested":
        return "Waiting for the requester to reply";
      case "payment_pending":
        return overdue
          ? `Payment overdue since ${formatShortIST(b.payment_deadline!)} — release the slot or extend the deadline`
          : `Waiting for the requester's payment until ${formatShortIST(b.payment_deadline!)} (${formatUntil(b.payment_deadline!, now)})`;
      case "payment_submitted":
        return latestSubmitted
          ? `Payment submitted — check UTR ${latestSubmitted.utr} for ${formatRupees(latestSubmitted.amountPaid)} in the bank account`
          : "Payment submitted — check it in the bank account";
      case "confirmed":
        return datePassed ? "Event date has passed — mark completed" : "Confirmed — nothing to do until the event";
      default:
        return `Closed: ${STATUS_LABELS[b.status]}`;
    }
  })();

  const assignable = staffRows
    .filter((s) => s.active && (s.role === "super_admin" || s.role === "admin" || (s.role === "category_manager" && (s.categories ?? []).includes(b.category))))
    .map((s) => ({ id: s.user_id as string, name: s.full_name as string }))
    .sort((x, y) => x.name.localeCompare(y.name));

  const paidTotal = (payments ?? []).filter((p) => p.status !== "rejected").reduce((s, p) => s + p.amountPaid, 0);

  return {
    id: b.id,
    code: b.booking_code,
    status: b.status,
    statusLabel: STATUS_LABELS[b.status],
    category: b.category,
    categoryLabel: CATEGORY_INFO[b.category].label,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    flags,
    nextStep,
    owner: b.owner_id ? { id: b.owner_id, name: nameOf(b.owner_id)! } : null,
    requester: {
      name: b.name,
      firstName: b.name.split(/\s+/)[0] ?? b.name,
      phone: masked ? maskPhone(b.phone) : b.phone,
      whatsapp: masked ? null : `https://wa.me/${b.phone.replace(/\D/g, "")}`,
      email: masked ? maskEmail(b.email) : b.email,
      masked,
      city: b.city,
      source: b.source ? optionLabel(SOURCE_OPTIONS, b.source) : null,
      verifiedAt: b.phone_verified_at,
    },
    answers,
    event,
    waitlist,
    attachments,
    payment: {
      visible: ["payment_pending", "payment_submitted", "confirmed", "completed"].includes(b.status) || advance !== null,
      full: payments !== null,
      advance,
      deadline: b.payment_deadline,
      extended: b.deadline_extended,
      overdue,
      submissions: payments ?? [],
      refund: b.refund_decision ? { decision: b.refund_decision, amount: num(b.refund_amount) } : null,
    },
    client: {
      needs: b.needs_client_approval,
      decision: b.client_decision,
      note: b.client_note,
      comment: b.client_comment,
      decidedBy: nameOf(b.client_decided_by),
      decidedAt: b.client_decided_at,
    },
    timeline,
    messages: (messagesQ.data ?? []).map((m) => ({
      id: m.id as string,
      channel: m.channel as string,
      template: m.template as string,
      status: m.status as string,
      error: m.error as string | null,
      audience: m.audience as string,
      createdAt: m.created_at as string,
    })),
    history,
    actions,
    inputs: {
      defaultAdvance: cat
        ? defaultAdvance({
            advanceType: cat.advance_type,
            advanceValue: Number(cat.advance_value),
            budget: num(b.budget),
            ticketPrice: event ? event.ticket_price : null,
            partySize: b.party_size,
          })
        : null,
      defaultDeadline: defaultDeadline(now, cat?.hold_hours ?? 24),
      assignable,
      latestPayment: latestSubmitted ? { amountPaid: latestSubmitted.amountPaid, amountDue: latestSubmitted.amountDue, utr: latestSubmitted.utr } : null,
      paidTotal,
      paid: b.status === "payment_submitted" || b.status === "confirmed",
    },
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof loadBookingDetail>>>;
