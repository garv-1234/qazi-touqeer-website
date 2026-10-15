import "server-only";
import { randomUUID } from "node:crypto";

/**
 * SMS sender. The provider is not chosen yet (MSG91 suggested); step 4 adds a
 * real implementation behind this interface.
 */
export interface SmsProvider {
  readonly name: string;
  sendOtp(to: string, code: string): Promise<{ messageId: string }>;
}

/** Development only: prints the code to the server console. */
const devConsoleProvider: SmsProvider = {
  name: "dev-console",
  async sendOtp(to, code) {
    console.info(`[dev sms] OTP for ${to}: ${code}`);
    return { messageId: `dev-${randomUUID()}` };
  },
};

export const isDevSms = () => process.env.NODE_ENV === "development";

/** Returns null when no provider is configured (the route answers 503). */
export function getSmsProvider(): SmsProvider | null {
  if (isDevSms()) return devConsoleProvider;
  return null;
}
