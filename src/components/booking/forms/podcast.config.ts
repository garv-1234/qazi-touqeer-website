// Field definitions for this form (docs/specs/booking-forms.md). Plain data, so the
// admin dashboard can show answers with the same labels and section order.
import type { FormConfig } from "@/components/booking/wizard/types";
import {
  AUDIENCE_SIZE_OPTIONS,
  LANGUAGE_OPTIONS,
  MIN_NOTICE_DAYS,
  OFFER_TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  PODCAST_FORMAT_OPTIONS,
  RECORDING_LENGTH_OPTIONS,
} from "@/lib/validation";
import { yourDetailsSection } from "./common";

export const podcastConfig: FormConfig = {
  category: "podcast",
  sections: [
    yourDetailsSection({ minDays: MIN_NOTICE_DAYS.podcast }),
    {
      id: "show",
      title: "Your show",
      fields: [
        { key: "show_name", kind: "text", label: "Show or channel name", maxLength: 100 },
        { key: "platforms", kind: "chips", label: "Where is it published?", help: "Pick all that apply.", options: PLATFORM_OPTIONS },
        {
          key: "channel_url",
          kind: "url",
          label: "Channel link",
          help: "Link to your channel or show page.",
          placeholder: "https://",
        },
        {
          key: "extra_url",
          kind: "url",
          label: "Another link",
          optional: true,
          help: "A popular episode, or your Instagram.",
          placeholder: "https://",
        },
        {
          key: "audience_size",
          kind: "select",
          label: "Audience size",
          help: "Followers or subscribers on your main platform.",
          options: AUDIENCE_SIZE_OPTIONS,
        },
      ],
    },
    {
      id: "episode",
      title: "The episode",
      fields: [
        { key: "format", kind: "radio", label: "Format", options: PODCAST_FORMAT_OPTIONS },
        {
          key: "venue_address",
          kind: "text",
          label: "Studio or venue address",
          help: "Full address with area and city.",
          maxLength: 200,
        },
        { key: "duration", kind: "select", label: "Recording length", options: RECORDING_LENGTH_OPTIONS },
        { key: "language", kind: "radio", label: "Language", options: LANGUAGE_OPTIONS },
        { key: "language_other", kind: "text", label: "Which language?", maxLength: 40 },
        {
          key: "topic",
          kind: "textarea",
          label: "Topic and sample questions",
          help: "What would you like to talk about? Add 3–5 sample questions.",
          maxLength: 1500,
          counter: true,
          rows: 6,
        },
      ],
    },
    {
      id: "offer",
      title: "The offer",
      fields: [
        { key: "offer_type", kind: "radio", label: "What are you offering?", options: OFFER_TYPE_OPTIONS },
        { key: "budget", kind: "amount", label: "Fee offered (₹)", help: "Your fee for Qazi, before GST." },
        { key: "notes", kind: "textarea", label: "Anything else we should know?", optional: true, maxLength: 1000 },
      ],
    },
  ],
};
