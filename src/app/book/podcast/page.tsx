import type { Metadata } from "next";
import { PodcastForm } from "@/components/booking/podcast-form";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

export const metadata: Metadata = { title: "Book a podcast or interview" };

export default function PodcastPage() {
  return (
    <>
      <PageIntro title={CATEGORY_INFO.podcast.label}>{CATEGORY_INFO.podcast.summary}</PageIntro>
      <PodcastForm />
    </>
  );
}
