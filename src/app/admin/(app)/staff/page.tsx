import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Staff" };

// Built in step 3b (docs/specs/admin-dashboard.md). The role check is already in place.
export default async function Page() {
  const { staff: s } = await requireStaffPage();
  const r = s.role;
  const allowed = r === 'super_admin';
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Staff</h1>
      <p className="text-sm text-neutral-600">
        {allowed ? "This page is coming in the next part of the admin build (step 3b)." : "You don't have access to this page."}
      </p>
    </div>
  );
}
