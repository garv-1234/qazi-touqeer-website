import type { Metadata } from "next";
import { PodcastForm } from "@/components/booking/forms/podcast";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

const info = CATEGORY_INFO.podcast;
export const metadata: Metadata = { title: info.formTitle };

export default function PodcastPage() {
  return (
    <>
      <PageIntro title={info.formTitle}>{info.formIntro}</PageIntro>
      <PodcastForm />
    </>
  );
}
