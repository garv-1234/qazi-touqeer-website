import type { BookingStatus } from "./status";

export type CategoryCode = "podcast" | "fan_meetup" | "misc_event";

/** Booking page copy (FR-W3). Placeholder text until final content arrives in step 5. */
export const CATEGORY_INFO: Record<
  CategoryCode,
  {
    label: string;
    href: string;
    summary: string;
    expect: string[];
    price: string;
    response: string;
    /** Booking form page title and intro (docs/specs/booking-forms.md). */
    formTitle: string;
    formIntro: string;
  }
> = {
  podcast: {
    label: "Podcast / Interview",
    href: "/book/podcast",
    summary: "Invite Qazi to your podcast, YouTube show or interview.",
    expect: ["Tell us about your channel and topic", "We review and reply with availability", "Pay the advance to confirm"],
    price: "On request",
    response: "Within 3 working days",
    formTitle: "Podcast / Interview",
    formIntro:
      "Invite Qazi to your podcast, YouTube show or interview. Tell us about your show and what you'd like to talk about.",
  },
  fan_meetup: {
    label: "Fan Meetup",
    href: "/book/fan-meetup",
    summary: "Book a seat at an upcoming meetup in your city.",
    expect: ["Pick a published meetup", "Come alone or with one friend", "Pay the ticket price to confirm your seat"],
    price: "See event price",
    response: "Within 24 hours",
    formTitle: "Meet Qazi",
    formIntro: "Pick a meetup near you. Seats are limited, and your seat is confirmed only after payment.",
  },
  misc_event: {
    label: "Miscellaneous Event",
    href: "/book/event",
    summary: "Shows, college fests, openings and brand collaborations.",
    expect: ["Share your event details and budget", "Upload a brief if you have one", "We review and send terms"],
    price: "On request",
    response: "Within 3 working days",
    formTitle: "Events and collaborations",
    formIntro:
      "Shows, college fests, launches, brand collaborations and private events. Tell us about your event and we'll get back with availability and terms.",
  },
};

/** What the requester should expect next, shown on Track My Booking. */
export const NEXT_STEP: Record<BookingStatus, string> = {
  submitted: "We have your request and will review it soon.",
  waitlisted: "This meetup is full. You're on the waitlist and we'll message you if a seat frees up.",
  in_review: "Our team is reviewing your request.",
  info_requested: "We need a little more information. Please reply below.",
  payment_pending: "Your request is approved. Pay the advance before the deadline to confirm it.",
  payment_submitted: "Thanks! We're checking your payment and will confirm shortly.",
  confirmed: "Your booking is confirmed. We'll send the details closer to the date.",
  completed: "This booking is complete. Thank you!",
  declined: "We're sorry, we couldn't take this request.",
  expired: "The payment deadline passed and the slot was released. You're welcome to book again.",
  cancelled: "This booking was cancelled.",
};

/**
 * Social links. TODO(content, step 5): replace with Qazi's verified Instagram
 * profile URL. Until then this points at Instagram's home page.
 */
export const SOCIAL_LINKS = { instagram: "https://www.instagram.com/" } as const;
