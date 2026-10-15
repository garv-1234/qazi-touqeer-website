import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Log in" };

const REASONS: Record<string, string> = {
  expired: "Please log in again.",
  no_access: "This account doesn't have access. Contact your admin.",
  password_set: "Your password is set. Log in with it now.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const { next, reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Qazi Touqeer</p>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">Staff login</h1>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} notice={reason ? REASONS[reason] : undefined} />
      </div>
    </main>
  );
}
