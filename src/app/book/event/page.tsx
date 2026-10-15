import type { Metadata } from "next";
import { MiscEventForm } from "@/components/booking/forms/misc-event";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

const info = CATEGORY_INFO.misc_event;
export const metadata: Metadata = { title: info.formTitle };

export default function EventPage() {
  return (
    <>
      <PageIntro title={info.formTitle}>{info.formIntro}</PageIntro>
      <MiscEventForm />
    </>
  );
}
