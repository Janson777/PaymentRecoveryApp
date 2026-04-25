/**
 * Shared helpers for sanitizing raw phone values coming from external
 * payloads (Shopify webhooks, Shopify GraphQL responses, etc.) before
 * they're persisted or used to choose a messaging channel.
 *
 * Note: this module is intentionally distinct from `~/lib/twilio.server.ts`:
 *   - `normalizePhone` (in twilio.server) formats a phone into E.164 for
 *     sending SMS.
 *   - The helpers here only trim/validate that a value is a non-empty
 *     string — they do not reformat the number.
 */

/**
 * Normalize a raw phone value from an external payload:
 *   - Returns `undefined` for null/undefined/non-string values.
 *   - Returns `undefined` for empty or whitespace-only strings.
 *   - Otherwise returns the trimmed string.
 *
 * Treating empty strings as `undefined` is important because Shopify often
 * sends `""` for missing address fields; if we forwarded those through as
 * strings we would overwrite previously-captured phones on update.
 */
export function normalizePhoneValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Given an ordered list of candidate phone values (typically from the most
 * authoritative source to the least), return the first one that normalizes
 * to a non-empty string, or `undefined` if none do.
 *
 * Usage:
 *   pickFirstNonEmptyPhone([
 *     payload.phone,
 *     payload.shipping_address?.phone,
 *     payload.billing_address?.phone,
 *     payload.customer?.phone,
 *   ]);
 */
export function pickFirstNonEmptyPhone(
  values: readonly unknown[]
): string | undefined {
  for (const value of values) {
    const normalized = normalizePhoneValue(value);
    if (normalized) return normalized;
  }
  return undefined;
}
