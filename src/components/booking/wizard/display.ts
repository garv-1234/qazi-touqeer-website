// How an answer is shown to people: the review step and the admin Request panel.
import { formatDayDate, formatIndianDigits } from "@/lib/booking/events";
import { optionLabel } from "@/lib/validation";
import type { FieldDef, Values } from "./types";

/** Display text for one answer, or null when it's empty (empty optional fields are left out). */
export function formatAnswer(f: FieldDef, v: Values[string]): string | null {
  switch (f.kind) {
    case "chips":
      return Array.isArray(v) && v.length ? v.map((x) => optionLabel(f.options, x)).join(", ") : null;
    case "select":
    case "radio":
      return typeof v === "string" && v ? optionLabel(f.options, v) : null;
    case "date":
      return typeof v === "string" && v ? formatDayDate(v) : null;
    case "amount":
      return typeof v === "string" && v ? `₹${formatIndianDigits(v)}` : null;
    case "file":
    case "verified-phone":
      return null;
    default:
      return typeof v === "string" && v.trim() ? v.trim() : null;
  }
}
