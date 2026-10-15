import Link from "next/link";

// Basic header and footer. Replaced by the full design in step 5.
export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight text-neutral-900">
          Qazi Touqeer
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/track" className="text-neutral-600 hover:text-neutral-900">
            Track booking
          </Link>
          <Link href="/book" className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white hover:bg-neutral-700">
            Book
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-neutral-200">
      <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-neutral-500 sm:px-6">
        Bookings for Qazi Touqeer happen only on this website. We never ask for payment over a phone call.
      </p>
    </footer>
  );
}

export function PageIntro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      {children && <div className="mt-3 text-neutral-600">{children}</div>}
    </div>
  );
}
