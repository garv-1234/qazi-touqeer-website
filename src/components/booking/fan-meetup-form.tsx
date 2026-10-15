"use client";

import { useEffect, useState } from "react";
import { Card, CheckboxField, Notice, SelectField, TextAreaField, TextField } from "@/components/ui";
import { formatDateTimeIST, formatRupees, type PublicEvent } from "@/lib/booking/events";
import { checked, num, str } from "@/lib/client/api";
import { BookingFlow } from "./booking-flow";

/** FR-B3 Fan Meetup, with live seats and "Join waitlist" (FR-B9). */
export function FanMeetupForm({ initialEventId }: { initialEventId?: string }) {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [partySize, setPartySize] = useState("1");
  const [isAdult, setIsAdult] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events: PublicEvent[] }) => {
        if (!cancelled) setEvents(d.events);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) return <Notice tone="error">We couldn&apos;t load the meetups. Please refresh the page.</Notice>;
  if (!events) return <p className="text-sm text-neutral-500">Loading meetups…</p>;
  if (events.length === 0) {
    return <Notice>There are no meetups open for booking right now. Please check back soon.</Notice>;
  }

  const selected = events.find((e) => e.id === eventId);
  const full = selected ? selected.seats_left < Number(partySize) : false;

  return (
    <BookingFlow
      category="fan_meetup"
      dateLabel={null}
      submitLabel={full ? "Join waitlist" : "Request my seat"}
      buildDetails={(fd) => ({
        event_id: str(fd, "event_id"),
        party_size: num(fd, "party_size"),
        is_adult: checked(fd, "is_adult"),
        guardian_name: checked(fd, "is_adult") ? undefined : str(fd, "guardian_name"),
        message: str(fd, "message"),
      })}
    >
      {(errors) => (
        <Card title="Choose your meetup">
          <SelectField
            label="Meetup"
            name="event_id"
            required
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            options={Object.fromEntries(
              events.map((e) => [
                e.id,
                `${e.city} · ${formatDateTimeIST(e.starts_at)} · ${e.seats_left > 0 ? `${e.seats_left} seats left` : "Full, join waitlist"}`,
              ]),
            )}
            error={errors["details.event_id"]}
          />
          {selected && (
            <div className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700">
              <p className="font-medium text-neutral-900">{selected.title}</p>
              <p>{selected.venue}, {selected.city}</p>
              <p>{formatDateTimeIST(selected.starts_at)}</p>
              <p>Ticket: {selected.ticket_price > 0 ? `${formatRupees(selected.ticket_price)} per person` : "Free"}</p>
            </div>
          )}
          <SelectField
            label="Number of people"
            name="party_size"
            required
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            options={{ "1": "Just me", "2": "Me and one friend" }}
            error={errors["details.party_size"]}
          />
          {full && <Notice>Not enough seats left for this meetup. You can still join the waitlist.</Notice>}
          <CheckboxField
            name="is_adult"
            label="I am 18 or older"
            checked={isAdult}
            onChange={(e) => setIsAdult(e.target.checked)}
          />
          {!isAdult && (
            <TextField
              label="Parent or guardian's name"
              name="guardian_name"
              required
              error={errors["details.guardian_name"]}
            />
          )}
          <TextAreaField
            label="Message for Qazi"
            name="message"
            rows={3}
            maxLength={500}
            error={errors["details.message"]}
          />
        </Card>
      )}
    </BookingFlow>
  );
}
