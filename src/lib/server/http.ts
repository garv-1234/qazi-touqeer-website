import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { BOT_MIN_FILL_MS, fieldErrors, type BotFields } from "@/lib/validation";
import { ipHash } from "./crypto";

export type ApiErrorBody = {
  error: string;
  message: string;
  fields?: Record<string, string>;
  [extra: string]: unknown;
};

export function apiError(status: number, error: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json<ApiErrorBody>({ error, message, ...extra }, { status });
}

/**
 * Logs the error with a short reference and returns it to the visitor, so a
 * support request can be matched to the log line.
 */
export function serverError(where: string, error: unknown) {
  const ref = `E-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  console.error(`[${ref}] ${where}`, error);
  return apiError(
    500,
    "server_error",
    "Something went wrong on our side. Your answers are saved. Please try again in a minute.",
    { ref },
  );
}

/** Parses the JSON body with a schema; on failure returns a 400 with field messages. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; response?: never } | { data?: never; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: apiError(400, "bad_request", "The request could not be read.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: apiError(400, "invalid", "Please check the highlighted fields.", {
        fields: fieldErrors(parsed.error),
      }),
    };
  }
  return { data: parsed.data };
}

/** Client IP as seen by Vercel (first x-forwarded-for entry). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export const clientIpHash = (req: Request) => ipHash(clientIp(req));

/** Honeypot + time trap. True means "looks like a bot". */
export function failsBotCheck(bot: BotFields): boolean {
  if (bot.website) return true;
  const elapsed = Date.now() - bot.started_at;
  return elapsed < BOT_MIN_FILL_MS || elapsed > 24 * 60 * 60 * 1000;
}

export const botRejected = () =>
  apiError(400, "bot_check", "Please wait a moment and try again.");

type PgError = { code?: string; message?: string } | null | undefined;

export const isUniqueViolation = (e: PgError, constraint: string) =>
  e?.code === "23505" && (e.message ?? "").includes(constraint);

/** Our own check_violation messages from the DB functions are safe to show. */
export const ruleMessage = (e: PgError) => (e?.code === "23514" ? e.message : undefined);
