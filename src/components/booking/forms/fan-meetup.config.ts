// Field definitions for the Fan Meetup form (docs/specs/booking-forms.md). Plain data, so
// the admin dashboard can show answers with the same labels and section order.
import type { FieldDef } from "@/components/booking/wizard/types";
import { AGE_GROUP_OPTIONS, PARTY_SIZE_OPTIONS } from "@/lib/validation";

export const MEETUP_RULES =
  "I've read the meetup rules: photo ID for everyone, entry closes 15 minutes after start, no gifts or bags beyond a small purse, and entry is refused for misbehaviour.";

export const whoIsComingFields: FieldDef[] = [
  { key: "age_group", kind: "radio", label: "Your age", options: AGE_GROUP_OPTIONS },
  { key: "party_size", kind: "radio", label: "How many people?", help: "Maximum 2 per booking.", options: PARTY_SIZE_OPTIONS },
  { key: "guest_name", kind: "text", label: "Second person's full name", help: "They must bring photo ID.", maxLength: 80 },
  {
    key: "guardian_name",
    kind: "text",
    label: "Parent or guardian's full name",
    help: "They must attend with you and bring photo ID.",
    maxLength: 80,
  },
  { key: "guardian_phone", kind: "phone", label: "Parent or guardian's phone" },
  {
    key: "message",
    kind: "textarea",
    label: "A message for Qazi",
    optional: true,
    help: "Short and sweet — he may read it out!",
    maxLength: 300,
    rows: 3,
  },
];
