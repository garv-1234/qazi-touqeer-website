"use client";

import { Card, SelectField, TextAreaField, TextField } from "@/components/ui";
import { num, str } from "@/lib/client/api";
import { EVENT_TYPE_LABELS, TRAVEL_LABELS, UPLOAD_MIME_TYPES } from "@/lib/validation";
import { BookingFlow } from "./booking-flow";

/** FR-B4 Miscellaneous Event (shows, fests, openings, brand collabs). */
export function MiscEventForm() {
  return (
    <BookingFlow
      category="misc_event"
      dateLabel="Event date"
      briefInput="brief"
      buildDetails={(fd) => ({
        organiser_name: str(fd, "organiser_name"),
        gstin: str(fd, "gstin"),
        event_type: str(fd, "event_type"),
        event_name: str(fd, "event_name"),
        venue: str(fd, "venue"),
        event_city: str(fd, "event_city"),
        duration_hours: num(fd, "duration_hours"),
        expected_audience: num(fd, "expected_audience"),
        role_expected: str(fd, "role_expected"),
        travel_stay: str(fd, "travel_stay"),
        travel_notes: str(fd, "travel_notes"),
        budget: num(fd, "budget"),
      })}
    >
      {(errors) => (
        <>
          <Card title="Organiser">
            <TextField
              label="Organiser or company name"
              name="organiser_name"
              autoComplete="organization"
              required
              error={errors["details.organiser_name"]}
            />
            <TextField
              label="GSTIN"
              name="gstin"
              maxLength={15}
              className="uppercase"
              error={errors["details.gstin"]}
            />
          </Card>
          <Card title="Event">
            <SelectField
              label="Event type"
              name="event_type"
              options={EVENT_TYPE_LABELS}
              required
              error={errors["details.event_type"]}
            />
            <TextField label="Event name" name="event_name" required error={errors["details.event_name"]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Venue" name="venue" required error={errors["details.venue"]} />
              <TextField label="Event city" name="event_city" required error={errors["details.event_city"]} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Duration (hours)"
                name="duration_hours"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0.5}
                required
                error={errors["details.duration_hours"]}
              />
              <TextField
                label="Expected audience"
                name="expected_audience"
                type="number"
                inputMode="numeric"
                min={1}
                required
                error={errors["details.expected_audience"]}
              />
            </div>
            <TextAreaField
              label="Role expected from Qazi"
              name="role_expected"
              rows={3}
              placeholder="e.g. Chief guest, 20-minute appearance and meet & greet"
              required
              error={errors["details.role_expected"]}
            />
            <SelectField
              label="Travel and stay"
              name="travel_stay"
              options={TRAVEL_LABELS}
              required
              error={errors["details.travel_stay"]}
            />
            <TextAreaField label="Travel notes" name="travel_notes" rows={2} error={errors["details.travel_notes"]} />
            <TextField
              label="Budget (₹)"
              name="budget"
              type="number"
              inputMode="numeric"
              min={1}
              required
              error={errors["details.budget"]}
            />
            <TextField
              label="Event brief"
              name="brief"
              type="file"
              accept={UPLOAD_MIME_TYPES.join(",")}
              hint="PDF or image, up to 10 MB."
              error={errors["details.brief_path"]}
            />
          </Card>
        </>
      )}
    </BookingFlow>
  );
}
