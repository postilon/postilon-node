import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifySignatureOptions {
  /** Oldest (or furthest in the future) timestamp accepted, in seconds. Default 300. */
  toleranceSeconds?: number;
}

/**
 * Checks the `X-Postilon-Signature` header of a webhook request: `t=<unix>,v1=<hex>`, where
 * `v1` is the HMAC-SHA256 of `"<t>.<raw body>"` keyed with the endpoint's signing secret.
 * Pass the body exactly as received, before any JSON parsing. Returns false, never throws,
 * for a missing or malformed header, a wrong signature or a timestamp outside the tolerance.
 */
export function verifyWebhookSignature(
  rawBody: string | Uint8Array,
  header: string | null | undefined,
  secret: string,
  { toleranceSeconds = 300 }: VerifySignatureOptions = {},
): boolean {
  if (typeof header !== "string" || !secret) return false;

  let timestamp: string | undefined;
  const signatures: Buffer[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) signatures.push(Buffer.from(value, "hex"));
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  // Every candidate is 32 bytes (checked above), so timingSafeEqual cannot throw.
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}
