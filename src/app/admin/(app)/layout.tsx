import { AdminShell } from "@/components/admin/shell";
import { requireStaffPage } from "@/lib/admin/auth";
import { loadBadgeCounts } from "@/lib/admin/pipeline";
import { requestTime } from "@/lib/admin/clock";
import { navFor, ROLE_LABELS } from "@/lib/admin/roles";

/** Signed-in staff only; the role is checked again by every page and API route. */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffPage();
  const badges = await loadBadgeCounts(session, requestTime());
  return (
    <AdminShell
      nav={navFor(session.staff)}
      badges={badges}
      name={session.staff.name}
      roleLabel={ROLE_LABELS[session.staff.role]}
    >
      {children}
    </AdminShell>
  );
}
