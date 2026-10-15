import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Qazi Touqeer — Official Website",
    template: "%s · Qazi Touqeer",
  },
  description:
    "Book Qazi Touqeer for podcasts, fan meetups and events. All bookings happen only through this official website.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} bg-neutral-50 antialiased`}>
        {children}
      </body>
    </html>
  );
}
