import type { ReactNode } from "react";
import type { CategoryCode } from "@/lib/booking/categories";
import type { Options } from "@/lib/validation";

/** Every answer in the form, keyed by the spec's keys. Amounts are digit strings. */
export type Values = Record<string, string | string[] | undefined>;

type FieldBase = {
  /** Spec key (also the stored key). */
  key: string;
  label: string;
  help?: string;
  /** Shown without the "required" mark. */
  optional?: boolean;
};

export type FieldDef = FieldBase &
  (
    | { kind: "text"; maxLength?: number; autoComplete?: string; placeholder?: string }
    | { kind: "email" | "url" | "phone" | "time"; placeholder?: string }
    | { kind: "textarea"; maxLength: number; counter?: boolean; rows?: number; placeholder?: string }
    | { kind: "date"; minDays: number }
    | { kind: "amount" }
    | { kind: "select" | "radio" | "chips"; options: Options }
    | { kind: "file" }
    | { kind: "verified-phone" }
  );

/** What a custom section gets to render with. */
export type SectionContext = {
  values: Values;
  setValue: (key: string, value: string | string[] | undefined) => void;
  error: (key: string) => string | undefined;
  touch: (key: string) => void;
};

export type SectionDef = {
  id: string;
  title: string;
  fields?: FieldDef[];
  /** Custom UI (meetup cards, price summary) instead of / after the fields. */
  render?: (ctx: SectionContext) => ReactNode;
  /** Field keys a custom section owns, in order (for the error summary). */
  customKeys?: { key: string; label: string }[];
  /** Review rows for a custom section. */
  review?: (values: Values) => [label: string, value: ReactNode][];
  shownWhen?: (values: Values) => boolean;
};

export type FormConfig = {
  category: CategoryCode;
  sections: SectionDef[];
  /** Extra consent box on the review step (meetup rules). */
  extraConsent?: { key: "consent_rules"; label: string };
  /** Answers to start with (e.g. a meetup preselected from a link). */
  initialValues?: Values;
  /** Server said the meetup closed: reload cards. */
  onMeetupClosed?: () => void;
};
