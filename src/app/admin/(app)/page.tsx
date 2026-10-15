import type { Metadata } from "next";
import { PipelineView } from "@/components/admin/pipeline-view";
import { requireStaffPage } from "@/lib/admin/auth";
import { requestTime } from "@/lib/admin/clock";
import { filtersToQuery, loadPipeline, parseFilters } from "@/lib/admin/pipeline";
import type { CategoryCode } from "@/lib/booking/categories";

export const metadata: Metadata = { title: "Pipeline" };

const ALL: CategoryCode[] = ["podcast", "fan_meetup", "misc_event"];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireStaffPage();
  const { staff } = session;
  const filters = parseFilters(await searchParams);
  const now = requestTime();
  const pipeline = await loadPipeline(session, filters, now);
  return (
    <PipelineView
      byColumn={pipeline.byColumn}
      rows={pipeline.rows}
      filters={filters}
      query={filtersToQuery(filters)}
      staffOptions={pipeline.staffOptions}
      categories={staff.role === "category_manager" ? staff.categories : ALL}
      userId={staff.userId}
      showPhone
      loadedAt={now}
    />
  );
}
