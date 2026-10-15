"use client";

import { useEffect, useRef } from "react";
import { BOT_MIN_FILL_MS, type BotFields } from "@/lib/validation";

/**
 * Honeypot + time trap for public forms. Render `honeypot` inside the form and
 * send `bot()` with the request. `waitForMinFill()` holds a very quick first
 * request until the server's minimum fill time has passed.
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

  const waitForMinFill = async () => {
    const wait = BOT_MIN_FILL_MS + 250 - (Date.now() - (startedAt.current || Date.now()));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };

  return { honeypot, bot, waitForMinFill };
}
