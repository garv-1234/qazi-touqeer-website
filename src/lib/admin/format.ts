// Formatting for the admin dashboard: India time, rupees, masking.
export { formatRupees } from "@/lib/booking/events";

const IST = "Asia/Kolkata";

/** "15 Oct, 2:30 pm" (spec). */
export const formatShortIST = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

/** "2 days ago", "just now". */
export function formatAge(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/** "in 2 days", "in 3 hours", "2 hours ago". */
export function formatUntil(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms < 0) return formatAge(iso, now);
  const h = Math.round(ms / 3600e3);
  if (h < 1) return `in ${Math.max(1, Math.round(ms / 60e3))} min`;
  if (h < 48) return `in ${h} ${h === 1 ? "hour" : "hours"}`;
  return `in ${Math.round(h / 24)} days`;
}

/** "+919812345663" -> "98••••63" (spec). */
export function maskPhone(phone: string): string {
  const national = phone.startsWith("+91") ? phone.slice(3) : phone.replace(/^\+/, "");
  return national.length > 4 ? `${national.slice(0, 2)}••••${national.slice(-2)}` : "••••";
}

/** "priya@gmail.com" -> "pr•••@gmail.com". */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return domain ? `${user.slice(0, 2)}•••@${domain}` : "•••";
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

// datetime-local inputs are read and written in India time, whatever the device's zone.
/** ISO -> "2026-10-18T18:00" in IST. */
export function toISTInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "2026-10-18T18:00" (IST) -> ISO with +05:30. */
export const fromISTInput = (value: string) => (value ? new Date(`${value}:00+05:30`).toISOString() : "");
