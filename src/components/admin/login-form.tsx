"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { btn, input } from "./bits";

/** Email + password; no sign-up. "Forgot password?" always gives the same answer. */
export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);

  async function login() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await postJson<{ next: string }>("/api/admin/login", { email, password, next });
    if (res.ok) {
      router.replace(res.data.next);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(res.error.message);
  }

  async function forgot() {
    setBusy(true);
    setError(null);
    const res = await postJson<{ message: string }>("/api/admin/forgot", { email });
    setBusy(false);
    setInfo(res.ok ? res.data.message : "If this email has an account, we've sent a reset link.");
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (mode === "login" ? login() : forgot());
      }}
    >
      {info && (
        <p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          {info}
        </p>
      )}
      <div>
        <label htmlFor="email" className="text-sm font-medium text-neutral-800">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </div>
      {mode === "login" && (
        <div>
          <label htmlFor="password" className="text-sm font-medium text-neutral-800">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Send reset link"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-neutral-600 underline"
        onClick={() => {
          setMode(mode === "login" ? "forgot" : "login");
          setError(null);
          setInfo(null);
        }}
      >
        {mode === "login" ? "Forgot password?" : "Back to log in"}
      </button>
    </form>
  );
}
