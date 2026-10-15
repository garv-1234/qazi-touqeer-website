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
