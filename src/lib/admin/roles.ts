// Staff roles and what each one sees (docs/specs/admin-dashboard.md, "What each role sees").
import type { CategoryCode } from "@/lib/booking/categories";

export type StaffRole = "super_admin" | "admin" | "category_manager" | "client_approver";

export type Staff = {
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  categories: CategoryCode[];
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  category_manager: "Category manager",
  client_approver: "Client approver",
};

export const canSeeCategory = (staff: Pick<Staff, "role" | "categories">, category: CategoryCode) =>
  staff.role !== "category_manager" || staff.categories.includes(category);

/** Phone and email: masked in lists for Category managers, everywhere for the Client approver. */
export const contactMasked = (role: StaffRole, where: "list" | "detail") =>
  role === "client_approver" || (role === "category_manager" && where === "list");

/** Payments panel: Category managers see the amount due only. */
export const seesPayments = (role: StaffRole) => role !== "category_manager";

export type NavItem = { href: string; label: string; badge?: "pipeline" | "approvals" };

export function navFor(staff: Staff): NavItem[] {
  const { role } = staff;
  const items: NavItem[] = [{ href: "/admin", label: "Pipeline", badge: "pipeline" }];
  if (role !== "category_manager") items.push({ href: "/admin/approvals", label: "Approvals", badge: "approvals" });
  if (role !== "category_manager" || staff.categories.includes("fan_meetup")) {
    items.push({ href: "/admin/events", label: "Events" });
  }
  if (role === "super_admin") {
    items.push(
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/audit", label: "Audit log" },
    );
  }
  return items;
}
