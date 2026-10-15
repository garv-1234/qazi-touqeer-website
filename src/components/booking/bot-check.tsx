"use client";

import { useEffect, useRef } from "react";
import type { BotFields } from "@/lib/validation";

/**
 * Honeypot + time trap for public forms. Render `honeypot` inside the form and
 * send `bot()` with the request.
 */
export function useBotCheck() {
  const startedAt = useRef(0);
  const trap = useRef<HTMLInputElement>(null);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const honeypot = (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );

  const bot = (): BotFields => ({
    website: trap.current?.value || undefined,
    started_at: startedAt.current || Date.now(),
  });

  return { honeypot, bot };
}
