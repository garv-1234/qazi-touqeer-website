import Link from "next/link";

// Temporary placeholder. The real home page is built in step 5 (frontend design).
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col justify-center px-6 py-24">
      <p className="text-sm uppercase tracking-[0.2em] text-neutral-500">Official website</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">Qazi Touqeer</h1>
      <p className="mt-6 text-lg leading-relaxed text-neutral-600">
        Podcast, fan meetup and event bookings happen only through this website.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/book" className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
          Book Qazi
        </Link>
        <Link
          href="/track"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          Track my booking
        </Link>
      </div>
    </main>
  );
}
