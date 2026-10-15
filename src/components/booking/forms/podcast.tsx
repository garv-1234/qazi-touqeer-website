"use client";

import { BookingWizard } from "@/components/booking/wizard/wizard";
import { podcastConfig } from "./podcast.config";

export function PodcastForm() {
  return <BookingWizard config={podcastConfig} />;
}
