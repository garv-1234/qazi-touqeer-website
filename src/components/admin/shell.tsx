"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { NavItem } from "@/lib/admin/roles";

type Props = {
  nav: NavItem[];
  badges: { pipeline: number; approvals: number };
  name: string;
  roleLabel: string;
  children: ReactNode;
};

/** Desktop: left sidebar. Phone: top bar with a menu button. */
export function AdminShell({ nav, badges, name, roleLabel, children }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/bookings") : pathname.startsWith(href));

  const links = (
    <nav aria-label="Admin" className="space-y-1">
      {nav.map((item) => {
        const count = item.badge ? badges[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            aria-current={active(item.href) ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
              active(item.href) ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            <span>{item.label}</span>
            {count > 0 && (
              <span
                aria-label={`${count} need action`}
                className={`rounded-full px-2 text-xs font-semibold ${active(item.href) ? "bg-white text-neutral-900" : "bg-red-600 text-white"}`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-neutral-200 pt-4 text-sm">
      <p className="font-medium text-neutral-900">{name}</p>
      <p className="text-neutral-500">{roleLabel}</p>
      <form action="/api/admin/logout" method="post" className="mt-2">
        <button type="submit" className="text-neutral-700 underline hover:text-neutral-900">
          Log out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 md:flex">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white p-4 md:sticky md:top-0 md:flex md:h-screen">
        <div className="space-y-6">
          <Link href="/admin" className="block px-3 text-sm font-semibold tracking-tight text-neutral-900">
            Qazi Touqeer · Admin
          </Link>
          {links}
        </div>
        {account}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <Link href="/admin" className="text-sm font-semibold text-neutral-900">
          Qazi Touqeer · Admin
        </Link>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin_menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Menu{badges.pipeline + badges.approvals > 0 ? ` (${badges.pipeline + badges.approvals})` : ""}
        </button>
      </header>
      {menuOpen && (
        <div id="admin_menu" className="space-y-4 border-b border-neutral-200 bg-white p-4 md:hidden">
          {links}
          {account}
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
