import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyShopifyHmac } from "./hmac.server";

const SECRET = "test-webhook-secret";

function computeHmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyShopifyHmac", () => {
  it("returns true for a valid HMAC", () => {
    const body = JSON.stringify({ id: 123, email: "test@example.com" });
    const hmac = computeHmac(body, SECRET);

    expect(verifyShopifyHmac(body, hmac, SECRET)).toBe(true);
  });

  it("returns false for an invalid HMAC", () => {
    const body = '{"order_id":456}';
    const hmac = computeHmac(body, SECRET);
    const tamperedHmac = hmac.slice(0, -4) + "AAAA";

    expect(verifyShopifyHmac(body, tamperedHmac, SECRET)).toBe(false);
  });

  it("returns false when body has been tampered with", () => {
    const originalBody = '{"amount":100}';
    const hmac = computeHmac(originalBody, SECRET);
    const tamperedBody = '{"amount":999}';

    expect(verifyShopifyHmac(tamperedBody, hmac, SECRET)).toBe(false);
  });

  it("returns false when secret is wrong", () => {
    const body = '{"test":true}';
    const hmac = computeHmac(body, SECRET);

    expect(verifyShopifyHmac(body, hmac, "wrong-secret")).toBe(false);
  });

  it("returns false when HMAC header length differs from computed", () => {
    const body = '{"id":1}';

    expect(verifyShopifyHmac(body, "short", SECRET)).toBe(false);
  });

  it("handles empty body", () => {
    const body = "";
    const hmac = computeHmac(body, SECRET);

    expect(verifyShopifyHmac(body, hmac, SECRET)).toBe(true);
  });

  it("handles unicode body content", () => {
    const body = '{"name":"café \u00e9clairs"}';
    const hmac = computeHmac(body, SECRET);

    expect(verifyShopifyHmac(body, hmac, SECRET)).toBe(true);
  });

  it("is deterministic — same input produces same result", () => {
    const body = '{"checkout_id":789}';
    const hmac = computeHmac(body, SECRET);

    expect(verifyShopifyHmac(body, hmac, SECRET)).toBe(true);
    expect(verifyShopifyHmac(body, hmac, SECRET)).toBe(true);
  });
});
