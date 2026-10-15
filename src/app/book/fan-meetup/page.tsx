import type { Metadata } from "next";
import { FanMeetupForm } from "@/components/booking/fan-meetup-form";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

export const metadata: Metadata = { title: "Book a fan meetup seat" };

export default async function FanMeetupPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  return (
    <>
      <PageIntro title={CATEGORY_INFO.fan_meetup.label}>{CATEGORY_INFO.fan_meetup.summary}</PageIntro>
      <FanMeetupForm initialEventId={typeof event === "string" ? event : undefined} />
    </>
  );
}
