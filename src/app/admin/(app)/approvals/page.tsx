import type { Metadata } from "next";
import { ApprovalsList } from "@/components/admin/approvals-list";
import { requireStaffPage } from "@/lib/admin/auth";
import { formatRupees } from "@/lib/admin/format";
import { CATEGORY_INFO, type CategoryCode } from "@/lib/booking/categories";
import { formatDayDate } from "@/lib/booking/events";

export const metadata: Metadata = { title: "Client sign-off" };

/** Requests flagged "needs client approval" with no decision yet (spec FR-A5). */
export default async function ApprovalsPage() {
  const { db, staff } = await requireStaffPage();
  if (staff.role === "category_manager") {
    return <p className="py-16 text-center text-sm text-neutral-600">This page is for the client approver and admins.</p>;
  }
  const { data } = await db
    .from("bookings")
    .select("booking_code, category, name, budget, preferred_date, details, client_note, updated_at, events(city, starts_at)")
    .eq("needs_client_approval", true)
    .is("client_decision", null)
    .not("status", "in", "(completed,declined,expired,cancelled)")
    .order("created_at", { ascending: true });

  const items = (data ?? []).map((b) => {
    const d = (b.details ?? {}) as Record<string, unknown>;
    const ev = (Array.isArray(b.events) ? b.events[0] : b.events) as { city: string; starts_at: string } | null;
    const category = b.category as CategoryCode;
    return {
      code: b.booking_code as string,
      updatedAt: b.updated_at as string,
      category: CATEGORY_INFO[category].label,
      name: b.name as string,
      detail: String(d.show_name ?? d.event_name ?? d.brand ?? (ev ? ev.city : "")),
      date: b.preferred_date ? formatDayDate(b.preferred_date as string) : ev ? new Date(ev.starts_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "",
      budget: b.budget !== null ? formatRupees(Number(b.budget)) : null,
      note: b.client_note as string | null,
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Client sign-off</h1>
      <ApprovalsList items={items} canDecide={staff.role === "client_approver" || staff.role === "super_admin"} onBehalf={staff.role === "super_admin"} />
    </div>
  );
}
