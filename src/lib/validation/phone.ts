/**
 * Normalises a phone number typed by a visitor to E.164.
 * Indian numbers may be typed without +91 ("98765 43210", "098765 43210",
 * "91 98765 43210"); other countries need the leading + and country code.
 * Returns null when the number is not valid.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (/^0?[6-9]\d{9}$/.test(s)) s = "+91" + s.slice(-10);
    else if (/^91[6-9]\d{9}$/.test(s)) s = "+" + s;
    else return null;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(s)) return null;
  return s;
}

/** "+919876543210" -> "+91 ••••• •3210" for display. */
export function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 3)} ••••• •${phone.slice(-4)}` : phone;
}
