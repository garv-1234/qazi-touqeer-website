// Field definitions for this form (docs/specs/booking-forms.md). Plain data, so the
// admin dashboard can show answers with the same labels and section order.
import type { FormConfig } from "@/components/booking/wizard/types";
import {
  BRAND_CATEGORY_OPTIONS,
  DELIVERABLE_OPTIONS,
  EVENT_AUDIENCE_OPTIONS,
  EVENT_DURATION_OPTIONS,
  EVENT_TYPE_OPTIONS,
  MIN_NOTICE_DAYS,
  ORGANISER_TYPE_OPTIONS,
  ROLE_OPTIONS,
  TRAVEL_OPTIONS,
  USAGE_RIGHTS_OPTIONS,
} from "@/lib/validation";
import { yourDetailsSection } from "./common";

export const miscEventConfig: FormConfig = {
  category: "misc_event",
  sections: [
    yourDetailsSection({ minDays: MIN_NOTICE_DAYS.misc_event }),
    {
      id: "about",
      title: "About you",
      fields: [
        { key: "organiser_type", kind: "radio", label: "You're booking as", options: ORGANISER_TYPE_OPTIONS },
        { key: "organisation", kind: "text", label: "Organisation name", autoComplete: "organization", maxLength: 120 },
        {
          key: "designation",
          kind: "text",
          label: "Your role",
          help: "e.g. Marketing Manager, Fest Coordinator",
          autoComplete: "organization-title",
          maxLength: 80,
        },
        { key: "gstin", kind: "text", label: "GSTIN", optional: true, help: "Needed for a GST invoice.", maxLength: 15 },
        {
          key: "org_url",
          kind: "url",
          label: "Website or social link",
          optional: true,
          help: "Helps us verify your organisation faster.",
          placeholder: "https://",
        },
      ],
    },
    {
      id: "event",
      title: "The event",
      fields: [
        { key: "event_type", kind: "select", label: "Type of event", options: EVENT_TYPE_OPTIONS },
        { key: "event_type_other", kind: "text", label: "Describe it", maxLength: 80 },
        { key: "event_name", kind: "text", label: "Event name", maxLength: 120 },
        { key: "venue_address", kind: "text", label: "Venue and address", help: "Venue name, area and city.", maxLength: 200 },
        { key: "start_time", kind: "time", label: "Start time", help: "On the preferred date." },
        { key: "duration", kind: "select", label: "How long is Qazi needed?", options: EVENT_DURATION_OPTIONS },
        { key: "audience", kind: "select", label: "Expected audience", options: EVENT_AUDIENCE_OPTIONS },
        { key: "roles", kind: "chips", label: "What would Qazi do?", help: "Pick all that apply.", options: ROLE_OPTIONS },
      ],
    },
    {
      id: "brand",
      title: "Brand collaboration",
      shownWhen: (v) => v.event_type === "brand_collab",
      fields: [
        { key: "brand", kind: "text", label: "Brand or product", maxLength: 100 },
        { key: "brand_category", kind: "select", label: "Product category", options: BRAND_CATEGORY_OPTIONS },
        { key: "deliverables", kind: "chips", label: "Deliverables", options: DELIVERABLE_OPTIONS },
        {
          key: "usage_rights",
          kind: "select",
          label: "Usage rights",
          help: "How long you'll use the content in ads.",
          options: USAGE_RIGHTS_OPTIONS,
        },
      ],
    },
    {
      id: "budget",
      title: "Budget and logistics",
      fields: [
        { key: "travel", kind: "radio", label: "Travel and stay", options: TRAVEL_OPTIONS },
        {
          key: "budget",
          kind: "amount",
          label: "Budget for Qazi's fee (₹)",
          help: "Fee only, before GST, excluding travel and stay.",
        },
        {
          key: "brief",
          kind: "file",
          label: "Event brief",
          optional: true,
          help: "A deck, poster or brief helps us decide faster.",
        },
        { key: "notes", kind: "textarea", label: "Anything else?", optional: true, maxLength: 1500 },
      ],
    },
  ],
};
