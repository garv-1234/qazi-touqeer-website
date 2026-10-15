import type { Metadata } from "next";
import { PageIntro } from "@/components/site-chrome";
import { TrackClient } from "@/components/track/track-client";

export const metadata: Metadata = { title: "Track my booking" };

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageIntro title="Track my booking">
        Enter your Booking ID and the WhatsApp number you booked with. We&apos;ll send a code to confirm it&apos;s
        you.
      </PageIntro>
      <TrackClient initialCode={typeof code === "string" ? code.toUpperCase() : undefined} />
    </main>
  );
}
