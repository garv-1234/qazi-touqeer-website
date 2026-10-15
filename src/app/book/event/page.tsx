import type { Metadata } from "next";
import { MiscEventForm } from "@/components/booking/misc-event-form";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

export const metadata: Metadata = { title: "Book Qazi for an event" };

export default function EventPage() {
  return (
    <>
      <PageIntro title={CATEGORY_INFO.misc_event.label}>{CATEGORY_INFO.misc_event.summary}</PageIntro>
      <MiscEventForm />
    </>
  );
}
