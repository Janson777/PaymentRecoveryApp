import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  isValidShopDomain,
  sanitizeShopDomain,
  verifyOAuthHmac,
} from "./shopify.server";

describe("isValidShopDomain", () => {
  it("returns true for a valid myshopify.com domain", () => {
    expect(isValidShopDomain("test-store.myshopify.com")).toBe(true);
  });

  it("returns true for alphanumeric-only subdomain", () => {
    expect(isValidShopDomain("shop123.myshopify.com")).toBe(true);
  });

  it("returns true for single-character subdomain", () => {
    expect(isValidShopDomain("a.myshopify.com")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidShopDomain("")).toBe(false);
  });

  it("returns false for domain without myshopify.com", () => {
    expect(isValidShopDomain("test-store.example.com")).toBe(false);
  });

  it("returns false for domain starting with hyphen", () => {
    expect(isValidShopDomain("-invalid.myshopify.com")).toBe(false);
  });

  it("returns false for domain with special characters", () => {
    expect(isValidShopDomain("store@name.myshopify.com")).toBe(false);
  });

  it("returns false for domain with spaces", () => {
    expect(isValidShopDomain("my store.myshopify.com")).toBe(false);
  });

  it("returns false for just myshopify.com without subdomain", () => {
    expect(isValidShopDomain(".myshopify.com")).toBe(false);
  });

  it("returns false for domain with trailing path", () => {
    expect(isValidShopDomain("store.myshopify.com/admin")).toBe(false);
  });
});

describe("sanitizeShopDomain", () => {
  it("trims whitespace", () => {
    expect(sanitizeShopDomain("  test-store.myshopify.com  ")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("converts to lowercase", () => {
    expect(sanitizeShopDomain("Test-Store.Myshopify.COM")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("strips https:// protocol", () => {
    expect(sanitizeShopDomain("https://test-store.myshopify.com")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("strips http:// protocol", () => {
    expect(sanitizeShopDomain("http://test-store.myshopify.com")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("strips trailing path", () => {
    expect(sanitizeShopDomain("test-store.myshopify.com/admin/shop")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("strips protocol and path together", () => {
    expect(
      sanitizeShopDomain("https://test-store.myshopify.com/admin")
    ).toBe("test-store.myshopify.com");
  });

  it("appends .myshopify.com when no dot in input", () => {
    expect(sanitizeShopDomain("test-store")).toBe(
      "test-store.myshopify.com"
    );
  });

  it("does not append .myshopify.com when domain has a dot", () => {
    expect(sanitizeShopDomain("store.myshopify.com")).toBe(
      "store.myshopify.com"
    );
  });

  it("handles all transformations combined", () => {
    expect(
      sanitizeShopDomain("  HTTPS://My-Shop.Myshopify.COM/admin/settings  ")
    ).toBe("my-shop.myshopify.com");
  });
});

describe("verifyOAuthHmac", () => {
  const SECRET = "test-oauth-secret";

  function buildSignedQuery(
    params: Record<string, string>,
    secret: string
  ): URLSearchParams {
    const sortedKeys = Object.keys(params).sort();
    const message = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
    const hmac = createHmac("sha256", secret).update(message).digest("hex");
    return new URLSearchParams({ ...params, hmac });
  }

  it("returns true for valid HMAC", () => {
    const query = buildSignedQuery(
      { shop: "store.myshopify.com", code: "abc123", timestamp: "1234567890" },
      SECRET
    );

    expect(verifyOAuthHmac(query, SECRET)).toBe(true);
  });

  it("returns false for invalid HMAC", () => {
    const query = new URLSearchParams({
      shop: "store.myshopify.com",
      code: "abc123",
      hmac: "invalid-hmac-value",
    });

    expect(verifyOAuthHmac(query, SECRET)).toBe(false);
  });

  it("returns false when hmac param is missing", () => {
    const query = new URLSearchParams({
      shop: "store.myshopify.com",
      code: "abc123",
    });

    expect(verifyOAuthHmac(query, SECRET)).toBe(false);
  });

  it("returns false with wrong secret", () => {
    const query = buildSignedQuery(
      { shop: "store.myshopify.com", code: "abc" },
      SECRET
    );

    expect(verifyOAuthHmac(query, "wrong-secret")).toBe(false);
  });

  it("sorts parameters alphabetically for verification", () => {
    const query = buildSignedQuery(
      { z_param: "last", a_param: "first", m_param: "middle" },
      SECRET
    );

    expect(verifyOAuthHmac(query, SECRET)).toBe(true);
  });

  it("excludes hmac from the signed message", () => {
    const params = { shop: "store.myshopify.com", timestamp: "123" };
    const sortedMessage = "shop=store.myshopify.com&timestamp=123";
    const hmac = createHmac("sha256", SECRET)
      .update(sortedMessage)
      .digest("hex");
    const query = new URLSearchParams({ ...params, hmac });

    expect(verifyOAuthHmac(query, SECRET)).toBe(true);
  });

  it("handles single parameter besides hmac", () => {
    const query = buildSignedQuery({ code: "xyz" }, SECRET);

    expect(verifyOAuthHmac(query, SECRET)).toBe(true);
  });

  it("handles empty params besides hmac", () => {
    const query = buildSignedQuery({}, SECRET);

    expect(verifyOAuthHmac(query, SECRET)).toBe(true);
  });
});
