"use client";

import { BookingWizard } from "@/components/booking/wizard/wizard";
import { miscEventConfig } from "./misc-event.config";

export function MiscEventForm() {
  return <BookingWizard config={miscEventConfig} />;
}
