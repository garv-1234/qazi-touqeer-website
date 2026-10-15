import type { FieldDef, SectionDef } from "@/components/booking/wizard/types";
import { SOURCE_OPTIONS } from "@/lib/validation";

/** "Your details" — the common block every form starts step 2 with. */
export function yourDetailsSection(dates?: { minDays: number }): SectionDef {
  const fields: FieldDef[] = [
    { key: "name", kind: "text", label: "Full name", autoComplete: "name", maxLength: 80 },
    { key: "phone", kind: "verified-phone", label: "WhatsApp number", help: "We'll send booking updates here." },
    { key: "email", kind: "email", label: "Email", help: "We'll also send updates and your receipt here." },
    { key: "city", kind: "text", label: "City", help: "The city you're based in.", autoComplete: "address-level2", maxLength: 60 },
  ];
  if (dates) {
    fields.push(
      {
        key: "preferred_date",
        kind: "date",
        minDays: dates.minDays,
        label: "Preferred date",
        help: "Not final — we'll confirm after review.",
      },
      {
        key: "backup_date",
        kind: "date",
        minDays: dates.minDays,
        label: "Backup date",
        optional: true,
        help: "Helps us find a slot faster.",
      },
    );
  }
  fields.push({ key: "source", kind: "select", label: "How did you hear about Qazi?", optional: true, options: SOURCE_OPTIONS });
  return { id: "you", title: "Your details", fields };
}
