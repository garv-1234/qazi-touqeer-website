"use client";

import { useState } from "react";
import { Card, SelectField, TextAreaField, TextField } from "@/components/ui";
import { num, str } from "@/lib/client/api";
import { AUDIENCE_LABELS, LANGUAGE_LABELS, PODCAST_FORMAT_LABELS } from "@/lib/validation";
import { BookingFlow } from "./booking-flow";

/** FR-B2 Podcast / Interview. */
export function PodcastForm() {
  const [feeType, setFeeType] = useState<string>("");

  return (
    <BookingFlow
      category="podcast"
      dateLabel="Preferred recording date"
      buildDetails={(fd) => ({
        channel_name: str(fd, "channel_name"),
        channel_links: (str(fd, "channel_links") ?? "")
          .split(/\s+/)
          .map((l) => l.trim())
          .filter(Boolean),
        audience_size: str(fd, "audience_size"),
        topic: str(fd, "topic"),
        sample_questions: str(fd, "sample_questions"),
        format: str(fd, "format"),
        duration_minutes: num(fd, "duration_minutes"),
        language: str(fd, "language"),
        fee_type: str(fd, "fee_type"),
        fee_offered: str(fd, "fee_type") === "paid" ? num(fd, "fee_offered") : undefined,
      })}
    >
      {(errors) => (
        <Card title="About your show">
          <TextField label="Channel or show name" name="channel_name" required error={errors["details.channel_name"]} />
          <TextAreaField
            label="Channel links"
            name="channel_links"
            rows={3}
            required
            placeholder="https://youtube.com/@yourchannel"
            hint="One link per line (YouTube, Instagram, Spotify…), up to 5."
            error={errors["details.channel_links"] ?? errors["details.channel_links.0"]}
          />
          <SelectField
            label="Audience size"
            name="audience_size"
            options={AUDIENCE_LABELS}
            required
            error={errors["details.audience_size"]}
          />
          <TextAreaField label="Topic" name="topic" required error={errors["details.topic"]} />
          <TextAreaField
            label="Sample questions"
            name="sample_questions"
            error={errors["details.sample_questions"]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Format"
              name="format"
              options={PODCAST_FORMAT_LABELS}
              required
              error={errors["details.format"]}
            />
            <TextField
              label="Duration (minutes)"
              name="duration_minutes"
              type="number"
              inputMode="numeric"
              min={10}
              max={480}
              required
              error={errors["details.duration_minutes"]}
            />
          </div>
          <SelectField
            label="Language"
            name="language"
            options={LANGUAGE_LABELS}
            required
            error={errors["details.language"]}
          />
          <SelectField
            label="Fee offered or barter"
            name="fee_type"
            options={{ paid: "Paid", barter: "Barter / no fee" }}
            required
            value={feeType}
            onChange={(e) => setFeeType(e.target.value)}
            error={errors["details.fee_type"]}
          />
          {feeType === "paid" && (
            <TextField
              label="Fee offered (₹)"
              name="fee_offered"
              type="number"
              inputMode="numeric"
              min={1}
              required
              error={errors["details.fee_offered"]}
            />
          )}
        </Card>
      )}
    </BookingFlow>
  );
}
