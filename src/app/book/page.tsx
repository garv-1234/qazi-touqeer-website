import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site-chrome";
import { CATEGORY_INFO } from "@/lib/booking/categories";

export const metadata: Metadata = { title: "Book Qazi" };

/** FR-W3 Book Qazi: the three categories. */
export default function BookPage() {
  return (
    <>
      <PageIntro title="Book Qazi">
        Choose what you&apos;d like to book. Every request is reviewed by our team, and you&apos;ll get updates on
        WhatsApp/SMS and email.
      </PageIntro>
      <div className="grid gap-4">
        {Object.values(CATEGORY_INFO).map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block rounded-2xl border border-neutral-200 bg-white p-6 transition-colors hover:border-neutral-400"
          >
            <h2 className="text-lg font-semibold text-neutral-900">{c.label}</h2>
            <p className="mt-1 text-sm text-neutral-600">{c.summary}</p>
            <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-neutral-700">
              {c.expect.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-neutral-500">
              From: <span className="text-neutral-800">{c.price}</span> · Response:{" "}
              <span className="text-neutral-800">{c.response}</span>
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
