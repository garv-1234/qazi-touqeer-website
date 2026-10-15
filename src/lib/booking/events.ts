/** A published meetup as returned by GET /api/events. */
export type PublicEvent = {
  id: string;
  title: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  ticket_price: number;
  seats_left: number;
  /** False within 24 hours of the start: shown greyed as "Bookings closed". */
  bookings_open: boolean;
};

const IST = "Asia/Kolkata";

/** "Sat, 14 Nov 2026, 5:00 pm" in India time. */
export const formatDateTimeIST = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/** "14 Nov 2026" for a YYYY-MM-DD date. */
export const formatDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

export const formatRupees = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/** "Sun, 25 Oct 2026" for a YYYY-MM-DD date (booking forms spec). */
export const formatDayDate = (ymd: string) => {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(new Date(`${ymd}T00:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`;
};

/** "100000" -> "1,00,000" (Indian digit grouping). */
export const formatIndianDigits = (digits: string) => (digits ? Number(digits).toLocaleString("en-IN") : "");
