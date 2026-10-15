import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server only. Lets a phone on the same Wi-Fi open the "Network" URL that
  // `next dev` prints. Without this, Next blocks its dev scripts for that origin,
  // the page never hydrates and the forms stay inert. Add more hostnames
  // (e.g. a tunnel) as a comma-separated DEV_ALLOWED_ORIGINS in .env.local.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  ],
};

export default nextConfig;
