import type { z } from "zod";
import type { CategoryCode } from "@/lib/booking/categories";
import { DETAIL_KEYS, isShown, SHOWN_WHEN, type Flat } from "@/lib/validation";
import type { FormConfig, Values } from "./types";

export type Consents = { consent_terms: boolean; consent_messages: boolean; consent_rules: boolean };

export const CONSENT_LABELS = {
  consent_terms: "I agree to the Terms, Privacy Policy and Refund Policy.",
  consent_messages: "I agree to receive booking updates on WhatsApp, SMS and email.",
} as const;

const present = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v : typeof v === "string" && v.trim() !== "" ? v : undefined;

export const fieldShown = (category: CategoryCode, key: string, values: Values) =>
  isShown(category, key, values as Flat);

/**
 * Applies a change and clears every field the change hides (spec:
 * "hiding one clears its value"). Under-18 meetup requests count as 2 people.
 */
export function applyChange(category: CategoryCode, prev: Values, key: string, value: Values[string]): Values {
  const next: Values = { ...prev, [key]: value };
  if (category === "fan_meetup" && key === "age_group") {
    next.party_size = value === "minor" ? "2" : undefined;
  }
  for (const k of Object.keys(SHOWN_WHEN[category])) {
    if (category === "fan_meetup" && k === "party_size") continue; // kept at 2 for under-18s
    if (!fieldShown(category, k, next)) delete next[k];
  }
  return next;
}

/** Builds the /api/bookings payload from the form's answers. */
export function toPayload(
  category: CategoryCode,
  values: Values,
  phone: string,
  consents: Partial<Consents>,
  briefPath?: string,
) {
  const details: Record<string, unknown> = {};
  for (const k of DETAIL_KEYS[category]) {
    const v = present(values[k]);
    if (v !== undefined) details[k] = v;
  }
  const num = (k: string) => (present(values[k]) === undefined ? undefined : Number(values[k]));
  const payload: Record<string, unknown> = {
    category,
    name: present(values.name),
    phone,
    email: present(values.email),
    city: present(values.city),
    source: present(values.source),
    details,
    consent_terms: consents.consent_terms || undefined,
    consent_messages: consents.consent_messages || undefined,
  };
  if (category === "fan_meetup") {
    payload.event_id = present(values.event_id);
    payload.party_size = num("party_size");
    payload.consent_rules = consents.consent_rules || undefined;
  } else {
    payload.preferred_date = present(values.preferred_date);
    payload.backup_date = present(values.backup_date);
    payload.budget = num("budget");
  }
  if (category === "misc_event" && briefPath) payload.brief_path = briefPath;
  return payload;
}

/** "details.show_name" / ["details", "platforms", 0] -> "show_name". */
export const errorKey = (path: readonly PropertyKey[] | string) => {
  const parts = typeof path === "string" ? path.split(".") : path.map(String);
  return parts[0] === "details" ? parts[1] : parts[0];
};

export function errorsByKey(error: z.ZodError | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if ("issues" in error && Array.isArray(error.issues)) {
    for (const issue of (error as z.ZodError).issues) out[errorKey(issue.path)] ??= issue.message;
  } else {
    for (const [path, msg] of Object.entries(error as Record<string, string>)) out[errorKey(path)] ??= msg;
  }
  return out;
}

/** Visible fields of the details step in page order: [key, label, sectionId]. */
export function detailFieldOrder(config: FormConfig, values: Values): { key: string; label: string; section: string }[] {
  const out: { key: string; label: string; section: string }[] = [];
  for (const s of config.sections) {
    if (s.shownWhen && !s.shownWhen(values)) continue;
    for (const c of s.customKeys ?? []) out.push({ ...c, section: s.id });
    for (const f of s.fields ?? []) {
      if (f.kind === "verified-phone") continue;
      if (fieldShown(config.category, f.key, values)) out.push({ key: f.key, label: f.label, section: s.id });
    }
  }
  return out;
}
