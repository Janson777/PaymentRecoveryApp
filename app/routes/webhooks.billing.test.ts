import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockVerifyShopifyHmac = vi.fn();
const mockFindShopByDomain = vi.fn();
const mockActivateProPlan = vi.fn();
const mockDeactivateProPlan = vi.fn();
const mockMapSubscriptionStatusToPlan = vi.fn();

vi.mock("~/lib/hmac.server", () => ({
  verifyShopifyHmac: (...args: unknown[]) => mockVerifyShopifyHmac(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopByDomain: (...args: unknown[]) => mockFindShopByDomain(...args),
}));

vi.mock("~/services/billing.server", () => ({
  activateProPlan: (...args: unknown[]) => mockActivateProPlan(...args),
  deactivateProPlan: (...args: unknown[]) => mockDeactivateProPlan(...args),
  mapSubscriptionStatusToPlan: (...args: unknown[]) =>
    mockMapSubscriptionStatusToPlan(...args),
}));

import { action } from "~/routes/webhooks.billing";

const BILLING_PAYLOAD = {
  admin_graphql_api_id: "gid://shopify/AppSubscription/123",
  name: "Pro",
  status: "ACTIVE",
  created_at: "2026-03-10T12:00:00Z",
  updated_at: "2026-03-10T12:05:00Z",
};

const ALL_HEADERS: Record<string, string> = {
  "X-Shopify-Topic": "app_subscriptions/update",
  "X-Shopify-Shop-Domain": "test-store.myshopify.com",
  "X-Shopify-Hmac-SHA256": "valid-hmac",
};

function buildRequest(
  payload: Record<string, unknown> = BILLING_PAYLOAD,
  options: {
    method?: string;
    headers?: Record<string, string>;
    omitHeaders?: string[];
  } = {}
): Request {
  const { method = "POST", headers = ALL_HEADERS, omitHeaders = [] } = options;
  const reqHeaders = new Headers({ "Content-Type": "application/json" });
  for (const [key, value] of Object.entries(headers)) {
    if (!omitHeaders.includes(key)) {
      reqHeaders.set(key, value);
    }
  }
  return new Request("http://localhost:3000/webhooks/billing", {
    method,
    headers: reqHeaders,
    body: method !== "GET" ? JSON.stringify(payload) : undefined,
  });
}

const savedEnv: Record<string, string | undefined> = {};

describe("webhooks.billing action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mockVerifyShopifyHmac.mockReturnValue(true);
    mockFindShopByDomain.mockResolvedValue({
      id: 10,
      shopDomain: "test-store.myshopify.com",
      planTier: "FREE",
    });
    mockActivateProPlan.mockResolvedValue(undefined);
    mockDeactivateProPlan.mockResolvedValue(undefined);
    mockMapSubscriptionStatusToPlan.mockReturnValue("PRO");
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

    it("returns 400 when topic header is missing", async () => {
      const request = buildRequest(BILLING_PAYLOAD, {
        omitHeaders: ["X-Shopify-Topic"],
      });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Missing webhook headers");
    });

    it("returns 400 when shop domain header is missing", async () => {
      const request = buildRequest(BILLING_PAYLOAD, {
        omitHeaders: ["X-Shopify-Shop-Domain"],
      });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when HMAC header is missing", async () => {
      const request = buildRequest(BILLING_PAYLOAD, {
        omitHeaders: ["X-Shopify-Hmac-SHA256"],
      });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });
  });

  describe("HMAC verification", () => {
    it("returns 500 when SHOPIFY_API_SECRET is not configured", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      delete process.env.SHOPIFY_API_SECRET;
      const request = buildRequest();
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(500);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Server misconfigured");
      consoleSpy.mockRestore();
    });

    it("returns 401 when HMAC is invalid", async () => {
      mockVerifyShopifyHmac.mockReturnValue(false);
      const request = buildRequest();
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(401);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Invalid HMAC");
    });

    it("passes raw body, HMAC header, and secret to verifyShopifyHmac", async () => {
      const request = buildRequest();
      await action({ request, params: {}, context: {} });

      expect(mockVerifyShopifyHmac).toHaveBeenCalledWith(
        JSON.stringify(BILLING_PAYLOAD),
        "valid-hmac",
        "test-secret"
      );
    });
  });

  describe("shop lookup", () => {
    it("returns 404 when shop is not found", async () => {
      mockFindShopByDomain.mockResolvedValue(null);
      const request = buildRequest();
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(404);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Shop not found");
    });

    it("looks up shop by domain from header", async () => {
      const request = buildRequest();
      await action({ request, params: {}, context: {} });

      expect(mockFindShopByDomain).toHaveBeenCalledWith(
        "test-store.myshopify.com"
      );
    });
  });

  describe("plan activation", () => {
    it("activates PRO plan when status maps to PRO", async () => {
      mockMapSubscriptionStatusToPlan.mockReturnValue("PRO");
      const request = buildRequest();
      await action({ request, params: {}, context: {} });

      expect(mockActivateProPlan).toHaveBeenCalledWith(
        10,
        "gid://shopify/AppSubscription/123"
      );
      expect(mockDeactivateProPlan).not.toHaveBeenCalled();
    });

    it("deactivates to FREE plan when status maps to FREE", async () => {
      mockMapSubscriptionStatusToPlan.mockReturnValue("FREE");
      const payload = { ...BILLING_PAYLOAD, status: "CANCELLED" };
      const request = buildRequest(payload);
      await action({ request, params: {}, context: {} });

      expect(mockDeactivateProPlan).toHaveBeenCalledWith(10);
      expect(mockActivateProPlan).not.toHaveBeenCalled();
    });

    it("calls mapSubscriptionStatusToPlan with the payload status", async () => {
      const payload = { ...BILLING_PAYLOAD, status: "FROZEN" };
      const request = buildRequest(payload);
      await action({ request, params: {}, context: {} });

      expect(mockMapSubscriptionStatusToPlan).toHaveBeenCalledWith("FROZEN");
    });

    it("returns ok after successful processing", async () => {
      const request = buildRequest();
      const response = await action({ request, params: {}, context: {} });

      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
    });

    it("uses admin_graphql_api_id from payload for activation", async () => {
      mockMapSubscriptionStatusToPlan.mockReturnValue("PRO");
      const payload = {
        ...BILLING_PAYLOAD,
        admin_graphql_api_id: "gid://shopify/AppSubscription/999",
      };
      const request = buildRequest(payload);
      await action({ request, params: {}, context: {} });

      expect(mockActivateProPlan).toHaveBeenCalledWith(
        10,
        "gid://shopify/AppSubscription/999"
      );
    });
  });

  describe("different shop domains", () => {
    it("processes webhook for the correct shop", async () => {
      const headers = {
        ...ALL_HEADERS,
        "X-Shopify-Shop-Domain": "another-store.myshopify.com",
      };
      mockFindShopByDomain.mockResolvedValue({
        id: 25,
        shopDomain: "another-store.myshopify.com",
        planTier: "PRO",
      });
      mockMapSubscriptionStatusToPlan.mockReturnValue("FREE");

      const payload = { ...BILLING_PAYLOAD, status: "CANCELLED" };
      const request = buildRequest(payload, { headers });
      await action({ request, params: {}, context: {} });

      expect(mockFindShopByDomain).toHaveBeenCalledWith(
        "another-store.myshopify.com"
      );
      expect(mockDeactivateProPlan).toHaveBeenCalledWith(25);
    });
  });
});
