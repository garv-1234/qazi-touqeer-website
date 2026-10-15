import type { Metadata } from "next";

// Every page under /admin is marked no-index (the proxy also sends X-Robots-Tag).
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Qazi Touqeer" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
