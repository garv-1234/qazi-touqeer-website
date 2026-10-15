import type { Metadata } from "next";
import Link from "next/link";
import { BookingDetailView } from "@/components/admin/booking-detail";
import { requireStaffPage } from "@/lib/admin/auth";
import { requestTime } from "@/lib/admin/clock";
import { loadBookingDetail } from "@/lib/admin/detail";
import { COLUMNS, filtersToQuery, isColumnId, loadPipeline, parseFilters } from "@/lib/admin/pipeline";

type Params = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: (await params).code.toUpperCase() };
}

export default async function BookingPage({ params, searchParams }: Params) {
  const session = await requireStaffPage();
  const { code } = await params;
  const sp = await searchParams;
  const now = requestTime();
  const detail = await loadBookingDetail(session, code, now);

  // A booking outside the person's categories is never revealed.
  if (!detail) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Request not found</h1>
        <Link href="/admin" className="text-sm underline">
          Back to the pipeline
        </Link>
      </div>
    );
  }

  // Previous / Next through the pipeline column the page was opened from.
  let nav: { prev: string | null; next: string | null; column: string; query: string } | null = null;
  const col = Array.isArray(sp.col) ? sp.col[0] : sp.col;
  if (isColumnId(col)) {
    const filters = parseFilters(sp);
    const pipeline = await loadPipeline(session, filters, now);
    const list = pipeline.byColumn[col];
    const i = list.findIndex((r) => r.code === detail.code);
    const query = `col=${col}${filtersToQuery(filters) ? `&${filtersToQuery(filters)}` : ""}`;
    nav = {
      prev: i > 0 ? list[i - 1].code : null,
      next: i >= 0 && i < list.length - 1 ? list[i + 1].code : null,
      column: COLUMNS.find((c) => c.id === col)!.title,
      query,
    };
  }

  return <BookingDetailView key={detail.updatedAt} detail={detail} role={session.staff.role} nav={nav} loadedAt={now} />;
}
