import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_INFO, type CategoryCode } from "@/lib/booking/categories";
import { formatDayDate } from "@/lib/booking/events";
import { STATUS_LABELS, type BookingStatus } from "@/lib/booking/status";
import { EVENT_TYPE_OPTIONS, optionLabel } from "@/lib/validation";
import type { StaffSession } from "./auth";
import { FILTER_FLAGS, isRestricted, type FlagCode } from "./flags";
import { initials, maskPhone } from "./format";
import { contactMasked } from "./roles";

// ---------------------------------------------------------------------
// Columns (spec "Board columns, left to right")
// ---------------------------------------------------------------------
export const COLUMNS = [
  { id: "new", title: "New" },
  { id: "waitlist", title: "Waitlist" },
  { id: "review", title: "In review" },
  { id: "awaiting", title: "Awaiting payment" },
  { id: "overdue", title: "Overdue" },
  { id: "verify", title: "Verify payment" },
  { id: "confirmed", title: "Confirmed" },
  { id: "closed", title: "Closed" },
] as const;
export type ColumnId = (typeof COLUMNS)[number]["id"];
export const isColumnId = (v: unknown): v is ColumnId => COLUMNS.some((c) => c.id === v);

const CLOSED: BookingStatus[] = ["completed", "declined", "expired", "cancelled"];
const CATEGORIES: CategoryCode[] = ["podcast", "fan_meetup", "misc_event"];

// ---------------------------------------------------------------------
// Filters (kept in the address bar)
// ---------------------------------------------------------------------
export type PipelineFilters = {
  categories: CategoryCode[];
  owner: string; // "any" | "me" | "unassigned" | staff user id
  flags: FlagCode[];
  days: "" | "7" | "30" | "90" | "custom";
  from: string;
  to: string;
  closed: boolean;
  q: string;
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) => one(v).split(",").map((s) => s.trim()).filter(Boolean);

export function parseFilters(sp: SearchParams): PipelineFilters {
  const days = one(sp.days);
  return {
    categories: list(sp.category).filter((c): c is CategoryCode => CATEGORIES.includes(c as CategoryCode)),
    owner: one(sp.owner) || "any",
    flags: list(sp.flags).filter((f): f is FlagCode => FILTER_FLAGS.includes(f as FlagCode)),
    days: (["7", "30", "90", "custom"] as const).find((d) => d === days) ?? "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : "",
    closed: one(sp.closed) === "1",
    q: one(sp.q).trim().slice(0, 100),
  };
}

export function filtersToQuery(f: PipelineFilters): string {
  const p = new URLSearchParams();
  if (f.categories.length) p.set("category", f.categories.join(","));
  if (f.owner !== "any") p.set("owner", f.owner);
  if (f.flags.length) p.set("flags", f.flags.join(","));
  if (f.days) p.set("days", f.days);
  if (f.days === "custom" && f.from) p.set("from", f.from);
  if (f.days === "custom" && f.to) p.set("to", f.to);
  if (f.closed) p.set("closed", "1");
  if (f.q) p.set("q", f.q);
  return p.toString();
}

// ---------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------
export type PipelineRow = {
  id: string;
  code: string;
  status: BookingStatus;
  statusLabel: string;
  category: CategoryCode;
  categoryLabel: string;
  name: string;
  phone: string;
  keyDetail: string;
  /** Event or preferred date (YYYY-MM-DD) for sorting, and its label. */
  date: string | null;
  dateLabel: string;
  createdAt: string;
  deadline: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerInitials: string;
  flags: FlagCode[];
  column: ColumnId;
};

type BookingRow = {
  id: string;
  booking_code: string;
  category: CategoryCode;
  status: BookingStatus;
  name: string;
  phone: string;
  email: string;
  preferred_date: string | null;
  details: Record<string, unknown>;
  below_minimum: boolean;
  needs_client_approval: boolean;
  client_decision: "approved" | "declined" | null;
  owner_id: string | null;
  payment_deadline: string | null;
  created_at: string;
  updated_at: string;
  events: { city: string; starts_at: string; title: string } | null;
};

const SELECT =
  "id, booking_code, category, status, name, phone, email, preferred_date, details, below_minimum, needs_client_approval, client_decision, owner_id, payment_deadline, created_at, updated_at, events(city, starts_at, title)";

const istDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

export function columnOf(status: BookingStatus, deadline: string | null, now: number): ColumnId {
  switch (status) {
    case "submitted":
      return "new";
    case "waitlisted":
      return "waitlist";
    case "in_review":
    case "info_requested":
      return "review";
    case "payment_pending":
      return deadline && new Date(deadline).getTime() < now ? "overdue" : "awaiting";
    case "payment_submitted":
      return "verify";
    case "confirmed":
      return "confirmed";
    default:
      return "closed";
  }
}

function keyDetail(b: BookingRow): string {
  const d = b.details ?? {};
  if (b.category === "podcast") return String(d.show_name ?? "");
  if (b.category === "fan_meetup") return b.events ? `${b.events.city} · ${formatDayDate(istDate(b.events.starts_at))}` : "";
  return String(d.event_name ?? d.brand ?? optionLabel(EVENT_TYPE_OPTIONS, d.event_type as string | undefined));
}

/** Sort order inside a column (spec "Sorted by"). */
function compare(col: ColumnId) {
  const t = (s: string | null) => (s ? new Date(s).getTime() : Number.MAX_SAFE_INTEGER);
  return (a: PipelineRow, b: PipelineRow) => {
    if (col === "awaiting" || col === "overdue") return t(a.deadline) - t(b.deadline);
    if (col === "confirmed") return (a.date ?? "9999").localeCompare(b.date ?? "9999");
    if (col === "closed") return t(b.createdAt) - t(a.createdAt);
    return t(a.createdAt) - t(b.createdAt);
  };
}

export type Pipeline = {
  rows: PipelineRow[];
  byColumn: Record<ColumnId, PipelineRow[]>;
  staffOptions: { id: string; name: string }[];
};

export async function loadPipeline(session: StaffSession, f: PipelineFilters, now: number): Promise<Pipeline> {
  const { db, staff } = session;
  let query = db.from("bookings").select(SELECT).order("created_at", { ascending: true }).limit(2000);
  if (f.categories.length) query = query.in("category", f.categories);
  if (!f.closed) query = query.not("status", "in", `(${CLOSED.join(",")})`);
  if (f.owner === "me") query = query.eq("owner_id", staff.userId);
  else if (f.owner === "unassigned") query = query.is("owner_id", null);
  else if (/^[0-9a-f-]{36}$/.test(f.owner)) query = query.eq("owner_id", f.owner);
  if (f.days === "7" || f.days === "30" || f.days === "90") {
    query = query.gte("created_at", new Date(now - Number(f.days) * 864e5).toISOString());
  } else if (f.days === "custom") {
    if (f.from) query = query.gte("created_at", new Date(`${f.from}T00:00:00+05:30`).toISOString());
    if (f.to) query = query.lt("created_at", new Date(new Date(`${f.to}T00:00:00+05:30`).getTime() + 864e5).toISOString());
  }
  const { data, error } = await query.returns<BookingRow[]>();
  if (error) throw error;
  let bookings = data ?? [];

  // Search: Booking ID (full or last 4), name, phone (4+ digits) or email, from 3 characters.
  if (f.q.length >= 3) {
    const q = f.q.toLowerCase();
    const digits = f.q.replace(/\D/g, "");
    bookings = bookings.filter(
      (b) =>
        b.booking_code.toLowerCase().includes(q) ||
        (digits.length >= 4 && b.booking_code.replace(/\D/g, "").endsWith(digits)) ||
        b.name.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q) ||
        (digits.length >= 4 && b.phone.replace(/\D/g, "").includes(digits)),
    );
  }

  // "Replied": the latest visible note on a request in review came from the requester.
  const reviewIds = bookings.filter((b) => b.status === "in_review").map((b) => b.id);
  const replied = new Set<string>();
  if (reviewIds.length) {
    const { data: notes } = await db
      .from("booking_notes")
      .select("booking_id, author_type, created_at")
      .eq("internal", false)
      .in("booking_id", reviewIds)
      .order("created_at", { ascending: true });
    const latest = new Map<string, string>();
    for (const n of notes ?? []) latest.set(n.booking_id, n.author_type);
    for (const [id, who] of latest) if (who === "requester") replied.add(id);
  }

  // Staff names (directory read on the server only).
  const { data: staffRows } = await createAdminClient()
    .from("staff_profiles")
    .select("user_id, full_name, role, categories, active");
  const names = new Map((staffRows ?? []).map((s) => [s.user_id as string, `${s.full_name}${s.active ? "" : " (deactivated)"}`]));
  const staffOptions = (staffRows ?? [])
    .filter((s) => s.active && s.role !== "client_approver")
    .map((s) => ({ id: s.user_id as string, name: s.full_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const masked = contactMasked(staff.role, "list");
  let rows: PipelineRow[] = bookings.map((b) => {
    const column = columnOf(b.status, b.payment_deadline, now);
    const flags: FlagCode[] = [];
    if (column === "overdue") flags.push("overdue");
    if (b.below_minimum) flags.push("below_minimum");
    if (b.needs_client_approval && !b.client_decision) flags.push("needs_client");
    if (b.client_decision === "approved") flags.push("client_approved");
    if (b.client_decision === "declined") flags.push("client_declined");
    if (b.category === "misc_event" && isRestricted(b.details ?? {})) flags.push("restricted");
    if (b.status === "info_requested") flags.push("info_requested");
    if (replied.has(b.id)) flags.push("replied");
    if (!b.owner_id && !CLOSED.includes(b.status)) flags.push("unassigned");
    // Confirmed, but the event (or preferred date) is behind us: ready to mark completed.
    if (b.status === "confirmed" && (b.events ? new Date(b.events.starts_at).getTime() < now : !!b.preferred_date && b.preferred_date < istDate(new Date(now).toISOString()))) {
      flags.push("event_passed");
    }
    const date = b.events ? istDate(b.events.starts_at) : b.preferred_date;
    const ownerName = b.owner_id ? (names.get(b.owner_id) ?? "Unknown") : null;
    return {
      id: b.id,
      code: b.booking_code,
      status: b.status,
      statusLabel: STATUS_LABELS[b.status],
      category: b.category,
      categoryLabel: CATEGORY_INFO[b.category].label,
      name: b.name,
      phone: masked ? maskPhone(b.phone) : b.phone,
      keyDetail: keyDetail(b),
      date,
      dateLabel: date ? formatDayDate(date) : "",
      createdAt: b.created_at,
      deadline: b.payment_deadline,
      ownerId: b.owner_id,
      ownerName,
      ownerInitials: ownerName ? initials(ownerName) : "",
      flags,
      column,
    };
  });
  if (f.flags.length) rows = rows.filter((r) => f.flags.every((fl) => r.flags.includes(fl)));

  const byColumn = Object.fromEntries(COLUMNS.map((c) => [c.id, [] as PipelineRow[]])) as Record<ColumnId, PipelineRow[]>;
  for (const r of rows) byColumn[r.column].push(r);
  for (const c of COLUMNS) byColumn[c.id].sort(compare(c.id));
  return { rows, byColumn, staffOptions };
}

/** Sidebar badges: requests that need action, and those waiting for client sign-off. */
export async function loadBadgeCounts(session: StaffSession, now: number) {
  const { db } = session;
  const nowIso = new Date(now).toISOString();
  const head = { count: "exact" as const, head: true };
  const [a, b, c] = await Promise.all([
    db.from("bookings").select("id", head).in("status", ["submitted", "payment_submitted"]),
    db.from("bookings").select("id", head).eq("status", "payment_pending").lt("payment_deadline", nowIso),
    db
      .from("bookings")
      .select("id", head)
      .eq("needs_client_approval", true)
      .is("client_decision", null)
      .not("status", "in", `(${CLOSED.join(",")})`),
  ]);
  return { pipeline: (a.count ?? 0) + (b.count ?? 0), approvals: c.count ?? 0 };
}
