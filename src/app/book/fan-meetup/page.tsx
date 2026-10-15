import type { Metadata } from "next";
import { FanMeetupForm } from "@/components/booking/forms/fan-meetup";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

const info = CATEGORY_INFO.fan_meetup;
export const metadata: Metadata = { title: info.formTitle };

export default async function FanMeetupPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  return (
    <>
      <PageIntro title={info.formTitle}>{info.formIntro}</PageIntro>
      <FanMeetupForm initialEventId={typeof event === "string" ? event : undefined} />
    </>
  );
}
