import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockVerifyShopifyHmac = vi.fn();

vi.mock("~/lib/hmac.server", () => ({
  verifyShopifyHmac: (...args: unknown[]) => mockVerifyShopifyHmac(...args),
}));

import { action } from "~/routes/webhooks.gdpr";

function buildRequest(
  payload: Record<string, unknown> = {},
  options: {
    method?: string;
    topic?: string | null;
    hmac?: string | null;
  } = {}
): Request {
  const { method = "POST", topic = "customers/data_request", hmac = "valid-hmac" } = options;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (topic !== null) {
    headers.set("X-Shopify-Topic", topic);
  }
  if (hmac !== null) {
    headers.set("X-Shopify-Hmac-SHA256", hmac);
  }
  return new Request("http://localhost:3000/webhooks/gdpr", {
    method,
    headers,
    body: method !== "GET" ? JSON.stringify(payload) : undefined,
  });
}

const savedEnv: Record<string, string | undefined> = {};

describe("webhooks.gdpr action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mockVerifyShopifyHmac.mockReturnValue(true);
  });

  afterAll(() => {
    if (savedEnv.SHOPIFY_API_SECRET === undefined) {
      delete process.env.SHOPIFY_API_SECRET;
    } else {
      process.env.SHOPIFY_API_SECRET = savedEnv.SHOPIFY_API_SECRET;
    }
  });

  describe("request validation", () => {
    it("returns 405 for non-POST requests", async () => {
      const request = buildRequest({}, { method: "GET" });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(405);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Method not allowed");
    });

    it("returns 401 when SHOPIFY_API_SECRET is missing", async () => {
      delete process.env.SHOPIFY_API_SECRET;
      const request = buildRequest({ shop_domain: "test.myshopify.com" });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(401);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when HMAC header is missing", async () => {
      const request = buildRequest(
        { shop_domain: "test.myshopify.com" },
        { hmac: null }
      );
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(401);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when HMAC verification fails", async () => {
      mockVerifyShopifyHmac.mockReturnValue(false);
      const request = buildRequest({ shop_domain: "test.myshopify.com" });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(401);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Invalid HMAC");
    });

    it("passes raw body, HMAC, and secret to verifyShopifyHmac", async () => {
      const payload = { shop_domain: "test.myshopify.com" };
      const request = buildRequest(payload, { hmac: "test-hmac-value" });
      await action({ request, params: {}, context: {} });

      expect(mockVerifyShopifyHmac).toHaveBeenCalledWith(
        JSON.stringify(payload),
        "test-hmac-value",
        "test-secret"
      );
    });
  });

  describe("GDPR topic handling", () => {
    it("handles customers/data_request topic", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "test.myshopify.com" },
        { topic: "customers/data_request" }
      );
      const response = await action({ request, params: {}, context: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        "GDPR: Customer data request for shop",
        "test.myshopify.com"
      );
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
      consoleSpy.mockRestore();
    });

    it("handles customers/redact topic with customer ID", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "test.myshopify.com", customer: { id: 12345 } },
        { topic: "customers/redact" }
      );
      const response = await action({ request, params: {}, context: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        "GDPR: Customer redact request for shop",
        "test.myshopify.com",
        "customer",
        12345
      );
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
      consoleSpy.mockRestore();
    });

    it("handles customers/redact topic without customer object", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "test.myshopify.com" },
        { topic: "customers/redact" }
      );
      await action({ request, params: {}, context: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        "GDPR: Customer redact request for shop",
        "test.myshopify.com",
        "customer",
        undefined
      );
      consoleSpy.mockRestore();
    });

    it("handles shop/redact topic", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "closing-store.myshopify.com" },
        { topic: "shop/redact" }
      );
      const response = await action({ request, params: {}, context: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        "GDPR: Shop redact request for",
        "closing-store.myshopify.com"
      );
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
      consoleSpy.mockRestore();
    });

    it("handles unknown topic with console log", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "test.myshopify.com" },
        { topic: "unknown/topic" }
      );
      const response = await action({ request, params: {}, context: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        "GDPR: Unknown topic",
        "unknown/topic"
      );
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe("successful response", () => {
    it("returns { ok: true } for all valid requests", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const request = buildRequest(
        { shop_domain: "test.myshopify.com" },
        { topic: "shop/redact" }
      );
      const response = await action({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data).toEqual({ ok: true });
      vi.restoreAllMocks();
    });
  });
});
