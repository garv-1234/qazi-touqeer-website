"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FILTER_FLAGS, FLAG_LABELS, type FlagCode } from "@/lib/admin/flags";
import { formatAge } from "@/lib/admin/format";
import { CATEGORY_INFO, type CategoryCode } from "@/lib/booking/categories";
import { FlagBadges, input } from "./bits";

type ColumnId = "new" | "waitlist" | "review" | "awaiting" | "overdue" | "verify" | "confirmed" | "closed";
const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "new", title: "New" },
  { id: "waitlist", title: "Waitlist" },
  { id: "review", title: "In review" },
  { id: "awaiting", title: "Awaiting payment" },
  { id: "overdue", title: "Overdue" },
  { id: "verify", title: "Verify payment" },
  { id: "confirmed", title: "Confirmed" },
  { id: "closed", title: "Closed" },
];

export type Row = {
  id: string;
  code: string;
  status: string;
  statusLabel: string;
  category: CategoryCode;
  categoryLabel: string;
  name: string;
  phone: string;
  keyDetail: string;
  date: string | null;
  dateLabel: string;
  createdAt: string;
  ownerName: string | null;
  ownerInitials: string;
  flags: FlagCode[];
  column: ColumnId;
};

type Filters = {
  categories: CategoryCode[];
  owner: string;
  flags: FlagCode[];
  days: "" | "7" | "30" | "90" | "custom";
  from: string;
  to: string;
  closed: boolean;
  q: string;
};

const ICON: Record<CategoryCode, string> = { podcast: "🎙️", fan_meetup: "🤝", misc_event: "🎤" };

// Board or list, remembered per person on this device; phones start in list view.
function useView(userId: string) {
  const key = `qt-admin-view:${userId}`;
  const read = () => {
    try {
      const v = window.localStorage.getItem(key);
      if (v === "board" || v === "list") return v;
    } catch {
      /* storage blocked */
    }
    return window.matchMedia("(max-width: 767px)").matches ? "list" : "board";
  };
  const view = useSyncExternalStore(
    (cb) => {
      window.addEventListener("qt-view", cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener("qt-view", cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => null,
  );
  const set = (v: "board" | "list") => {
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* storage blocked */
    }
    window.dispatchEvent(new Event("qt-view"));
  };
  return [view, set] as const;
}

function toQuery(f: Filters) {
  const p = new URLSearchParams();
  if (f.categories.length) p.set("category", f.categories.join(","));
  if (f.owner !== "any") p.set("owner", f.owner);
  if (f.flags.length) p.set("flags", f.flags.join(","));
  if (f.days) p.set("days", f.days);
  if (f.days === "custom" && f.from) p.set("from", f.from);
  if (f.days === "custom" && f.to) p.set("to", f.to);
  if (f.closed) p.set("closed", "1");
  if (f.q.trim().length >= 3) p.set("q", f.q.trim());
  return p.toString();
}

export function PipelineView(props: {
  byColumn: Record<ColumnId, Row[]>;
  rows: Row[];
  filters: Filters;
  query: string;
  staffOptions: { id: string; name: string }[];
  categories: CategoryCode[];
  userId: string;
  showPhone: boolean;
  loadedAt: number;
}) {
  const { byColumn, rows, filters, query, staffOptions, categories, userId, loadedAt } = props;
  const router = useRouter();
  const [view, setView] = useView(userId);
  const [search, setSearch] = useState(filters.q);
  const [tick, setTick] = useState(loadedAt);

  const apply = (next: Partial<Filters>) => {
    const qs = toQuery({ ...filters, q: search, ...next });
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  };

  // Search as you type, after 3 characters.
  useEffect(() => {
    const t = search.trim();
    if (t === filters.q || (t.length > 0 && t.length < 3)) return;
    const timer = setTimeout(() => {
      const qs = toQuery({ ...filters, q: t });
      router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters, router]);

  // Refresh every 60 seconds and when the tab comes back into focus.
  useEffect(() => {
    const refresh = () => router.refresh();
    const interval = setInterval(refresh, 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const clock = setInterval(() => setTick(Date.now()), 15_000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const columns = COLUMNS.filter((c) => c.id !== "closed" || filters.closed);
  const href = (r: Row) => `/admin/bookings/${r.code}?col=${r.column}${query ? `&${query}` : ""}`;
  const updated = formatAge(new Date(loadedAt).toISOString(), Math.max(tick, loadedAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pipeline</h1>
        <div className="flex items-center gap-2 text-sm" role="group" aria-label="View">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-lg border px-3 py-1.5 ${view === v ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
            >
              {v === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <section aria-label="Filters" className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="text-xs font-medium text-neutral-600">
              Search
            </label>
            <input
              id="q"
              type="search"
              placeholder="Booking ID, last 4 digits, name, phone or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="owner" className="text-xs font-medium text-neutral-600">
              Owner
            </label>
            <select id="owner" value={filters.owner} onChange={(e) => apply({ owner: e.target.value })} className={input}>
              <option value="any">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="days" className="text-xs font-medium text-neutral-600">
              Created
            </label>
            <select id="days" value={filters.days} onChange={(e) => apply({ days: e.target.value as Filters["days"] })} className={input}>
              <option value="">Any time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          {filters.days === "custom" && (
            <>
              <div>
                <label htmlFor="from" className="text-xs font-medium text-neutral-600">
                  From
                </label>
                <input id="from" type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} className={input} />
              </div>
              <div>
                <label htmlFor="to" className="text-xs font-medium text-neutral-600">
                  To
                </label>
                <input id="to" type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} className={input} />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {categories.length > 1 &&
            categories.map((c) => {
              const on = filters.categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => apply({ categories: on ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] })}
                  className={`rounded-full border px-3 py-1 ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
                >
                  {CATEGORY_INFO[c].label}
                </button>
              );
            })}
          <span className="mx-1 h-4 w-px bg-neutral-200" aria-hidden />
          {FILTER_FLAGS.map((f) => {
            const on = filters.flags.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => apply({ flags: on ? filters.flags.filter((x) => x !== f) : [...filters.flags, f] })}
                className={`rounded-full border px-3 py-1 ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
              >
                {FLAG_LABELS[f]}
              </button>
            );
          })}
          <label className="ml-1 flex items-center gap-2">
            <input type="checkbox" checked={filters.closed} onChange={(e) => apply({ closed: e.target.checked })} />
            Show closed
          </label>
          <span className="ml-auto text-xs text-neutral-500" aria-live="polite">
            Updated {updated}
          </span>
        </div>
      </section>

      {view === null ? null : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((c) => (
            <section key={c.id} aria-labelledby={`col_${c.id}`} className="w-72 shrink-0 rounded-xl bg-neutral-100 p-2">
              <h2 id={`col_${c.id}`} className="flex items-center justify-between px-1 py-1 text-sm font-semibold text-neutral-800">
                {c.title}
                <span className="rounded-full bg-white px-2 text-xs text-neutral-600">{byColumn[c.id].length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {byColumn[c.id].map((r) => (
                  <li key={r.id}>
                    <Link href={href(r)} className="block rounded-lg border border-neutral-200 bg-white p-3 text-sm hover:border-neutral-400">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-neutral-600">{r.code}</span>
                        {r.ownerInitials ? (
                          <span title={r.ownerName ?? ""} className="rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-700">
                            {r.ownerInitials}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-neutral-500">
                        <span aria-hidden>{ICON[r.category]}</span> {r.categoryLabel}
                      </span>
                      <span className="mt-1 block font-medium text-neutral-900">{r.name}</span>
                      {r.keyDetail && <span className="block truncate text-neutral-700">{r.keyDetail}</span>}
                      <span className="mt-1 flex justify-between text-xs text-neutral-500">
                        <span>{r.dateLabel}</span>
                        <span>{formatAge(r.createdAt, Math.max(tick, loadedAt))}</span>
                      </span>
                      <span className="mt-2 block">
                        <FlagBadges flags={r.flags} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ListView rows={rows} href={href} now={Math.max(tick, loadedAt)} />
      )}
    </div>
  );
}

type SortKey = "code" | "statusLabel" | "categoryLabel" | "name" | "keyDetail" | "date" | "ownerName" | "createdAt";

function ListView({ rows, href, now }: { rows: Row[]; href: (r: Row) => string; now: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [page, setPage] = useState(0);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? "")) * sort.dir),
    [rows, sort],
  );
  const pages = Math.max(1, Math.ceil(sorted.length / 50));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * 50, current * 50 + 50);
  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              {th("code", "Booking ID")}
              {th("statusLabel", "Status")}
              {th("categoryLabel", "Category")}
              {th("name", "Name")}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Phone
              </th>
              {th("keyDetail", "Key detail")}
              {th("date", "Date")}
              {th("ownerName", "Owner")}
              {th("createdAt", "Created")}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Flags
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={href(r)} className="underline">
                    {r.code}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.statusLabel}</td>
                <td className="px-3 py-2">{r.categoryLabel}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                <td className="max-w-48 truncate px-3 py-2">{r.keyDetail}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.dateLabel}</td>
                <td className="px-3 py-2">{r.ownerName ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatAge(r.createdAt, now)}</td>
                <td className="px-3 py-2">
                  <FlagBadges flags={r.flags} />
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  No requests match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="underline disabled:opacity-40">
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="underline disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
