"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fieldId } from "@/components/booking/wizard/fields";
import type { FormConfig, SectionContext, Values } from "@/components/booking/wizard/types";
import { BookingWizard } from "@/components/booking/wizard/wizard";
import { SOCIAL_LINKS } from "@/lib/booking/categories";
import { formatDateTimeIST, formatRupees, type PublicEvent } from "@/lib/booking/events";
import { AGE_GROUP_OPTIONS, PARTY_SIZE_OPTIONS } from "@/lib/validation";
import { yourDetailsSection } from "./common";

const RULES =
  "I've read the meetup rules: photo ID for everyone, entry closes 15 minutes after start, no gifts or bags beyond a small purse, and entry is refused for misbehaviour.";

/** People counted for seats: under-18s come with a guardian, so 2. */
const peopleFor = (v: Values) => (v.age_group === "minor" ? 2 : v.party_size === "2" ? 2 : 1);

function seatBadge(e: PublicEvent): { text: string; tone: string } {
  if (!e.bookings_open) return { text: "Bookings closed", tone: "text-neutral-500" };
  if (e.seats_left <= 0) return { text: "Full — join the waitlist", tone: "text-neutral-700" };
  if (e.seats_left <= 10) {
    return { text: `Only ${e.seats_left} ${e.seats_left === 1 ? "seat" : "seats"} left`, tone: "text-amber-700" };
  }
  return { text: "Seats available", tone: "text-emerald-700" };
}

/** FR-B3 Fan Meetup: pick a meetup card, who's coming, live price and seat rules. */
export function FanMeetupForm({ initialEventId }: { initialEventId?: string }) {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Seats come from the server; refreshed on load and whenever a card is picked.
  const refresh = useCallback(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events: PublicEvent[] }) => {
        setEvents(d.events);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const config = useMemo<FormConfig | null>(() => {
    if (!events) return null;
    const byId = (id: unknown) => events.find((e) => e.id === id);
    return {
      category: "fan_meetup",
      // A ?event= link preselects its card if it can still be booked.
      initialValues: byId(initialEventId)?.bookings_open ? { event_id: initialEventId } : undefined,
      onMeetupClosed: refresh,
      extraConsent: { key: "consent_rules", label: RULES },
      sections: [
        {
          id: "meetup",
          title: "Choose a meetup",
          customKeys: [{ key: "event_id", label: "Meetup" }],
          render: (ctx) => <MeetupCards ctx={ctx} events={events} onPick={refresh} />,
          review: (v) => {
            const e = byId(v.event_id);
            return e ? [["Meetup", `${e.city} · ${e.venue} · ${formatDateTimeIST(e.starts_at)}`]] : [];
          },
        },
        yourDetailsSection(),
        {
          id: "who",
          title: "Who's coming",
          fields: [
            { key: "age_group", kind: "radio", label: "Your age", options: AGE_GROUP_OPTIONS },
            { key: "party_size", kind: "radio", label: "How many people?", help: "Maximum 2 per booking.", options: PARTY_SIZE_OPTIONS },
            { key: "guest_name", kind: "text", label: "Second person's full name", help: "They must bring photo ID.", maxLength: 80 },
            {
              key: "guardian_name",
              kind: "text",
              label: "Parent or guardian's full name",
              help: "They must attend with you and bring photo ID.",
              maxLength: 80,
            },
            { key: "guardian_phone", kind: "phone", label: "Parent or guardian's phone" },
            {
              key: "message",
              kind: "textarea",
              label: "A message for Qazi",
              optional: true,
              help: "Short and sweet — he may read it out!",
              maxLength: 300,
              rows: 3,
            },
          ],
          render: ({ values }) => <SeatsAndPrice event={byId(values.event_id)} people={peopleFor(values)} />,
          review: (v) => (v.age_group === "minor" ? [["People", "2 (you and your parent or guardian)"]] : []),
        },
      ],
    };
  }, [events, initialEventId, refresh]);

  if (loadError && !events) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        We couldn&apos;t load the meetups. Please check your connection and{" "}
        <button type="button" className="underline" onClick={refresh}>
          try again
        </button>
        .
      </p>
    );
  }
  if (!events || !config) return <p className="text-sm text-neutral-500">Loading meetups…</p>;
  if (events.length === 0) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700">
        <p>No meetups are open right now. New dates are announced on Qazi&apos;s Instagram first.</p>
        <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-medium underline">
          Follow on Instagram
        </a>
      </section>
    );
  }
  return <BookingWizard config={config} />;
}

function MeetupCards({ ctx, events, onPick }: { ctx: SectionContext; events: PublicEvent[]; onPick: () => void }) {
  const { values, setValue, error, touch } = ctx;
  const err = error("event_id");

  return (
    <fieldset id={fieldId("event_id")} tabIndex={-1} aria-invalid={!!err} aria-describedby={err ? "f_event_id_error" : undefined} className="focus:outline-none">
      <legend className="sr-only">Meetup</legend>
      <div className="grid gap-3">
        {events.map((e) => {
          const badge = seatBadge(e);
          const selected = values.event_id === e.id;
          return (
            <label
              key={e.id}
              className={`block rounded-xl border p-4 transition-colors ${
                !e.bookings_open
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-100 opacity-60"
                  : selected
                    ? "cursor-pointer border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900"
                    : "cursor-pointer border-neutral-300 bg-white hover:border-neutral-500"
              } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900/30`}
            >
              <input
                type="radio"
                name="event_id"
                value={e.id}
                checked={selected}
                disabled={!e.bookings_open}
                className="sr-only"
                onChange={() => {
                  setValue("event_id", e.id);
                  touch("event_id");
                  onPick();
                }}
              />
              <span className="block text-xl font-semibold text-neutral-900">{e.city}</span>
              <span className="mt-1 block text-sm text-neutral-700">{e.venue}</span>
              <span className="block text-sm text-neutral-700">{formatDateTimeIST(e.starts_at)}</span>
              <span className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-neutral-900">{e.ticket_price > 0 ? `${formatRupees(e.ticket_price)} per person` : "Free"}</span>
                <span className={`font-medium ${badge.tone}`}>{badge.text}</span>
              </span>
            </label>
          );
        })}
      </div>
      {err && (
        <p id="f_event_id_error" className="mt-2 text-sm text-red-600">
          {err}
        </p>
      )}
    </fieldset>
  );
}

function SeatsAndPrice({ event, people }: { event?: PublicEvent; people: number }) {
  if (!event) return null;
  const waitlist = event.seats_left < people;
  return (
    <div className="space-y-3">
      {waitlist && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {event.seats_left === 1
            ? "Only 1 seat left. Your request will join the waitlist, or choose 1 person."
            : "This meetup is full. Your request will join the waitlist."}
        </p>
      )}
      <p aria-live="polite" className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
        {event.ticket_price > 0
          ? `Ticket ${formatRupees(event.ticket_price)} × ${people} = ${formatRupees(event.ticket_price * people)}. You'll pay only after your request is approved.`
          : "Free entry. Registration required."}
      </p>
    </div>
  );
}
