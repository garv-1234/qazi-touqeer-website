"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, input } from "@/components/admin/bits";
import { createClient } from "@/lib/supabase/browser";

type Stage = "checking" | "ready" | "invalid" | "saving";

/**
 * Invited staff (and password resets) land here from the email link. Supabase
 * links arrive as ?code=… (PKCE), ?token_hash=…&type=… or #access_token=… .
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as "invite" | "recovery" | null;

    const done = (ok: boolean) => setStage(ok ? "ready" : "invalid");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => done(!error));
    } else if (tokenHash && type) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => done(!error));
    } else if (hash.get("access_token") && hash.get("refresh_token")) {
      supabase.auth
        .setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! })
        .then(({ error }) => done(!error));
    } else {
      done(false);
    }
  }, []);

  async function save() {
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setStage("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStage("ready");
      return setError("We couldn't save the password. The link may have expired; ask for a new one.");
    }
    await supabase.auth.signOut();
    router.replace("/admin/login?reason=password_set");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-neutral-900">Set your password</h1>
        {stage === "checking" && <p className="text-sm text-neutral-600">Checking your link…</p>}
        {stage === "invalid" && (
          <p role="alert" className="text-sm text-red-700">
            This link is invalid or has expired. Ask your admin to resend the invite, or use &quot;Forgot password?&quot; on
            the login page.
          </p>
        )}
        {(stage === "ready" || stage === "saving") && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div>
              <label htmlFor="pw" className="text-sm font-medium text-neutral-800">
                New password
              </label>
              <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="pw2" className="text-sm font-medium text-neutral-800">
                Confirm password
              </label>
              <input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button type="submit" disabled={stage === "saving"} className={`${btn.primary} w-full`}>
              {stage === "saving" ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
