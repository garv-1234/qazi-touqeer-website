// Zod schemas shared by the browser forms and the API routes.
// The server always validates again; never trust the browser.
export * from "./common";
export * from "./booking";
export * from "./requests";
export { normalizePhone, maskPhone } from "./phone";

import type { z } from "zod";

/** Flattens Zod issues to { "details.channel_name": "message" } (first message per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
