import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  const computed = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expected = Buffer.from(computed, "utf8");
  const received = Buffer.from(hmacHeader, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
