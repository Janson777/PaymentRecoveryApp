import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockVerifyShopifyHmac = vi.fn();
const mockFindShopByDomain = vi.fn();
const mockDeactivateShop = vi.fn();
const mockPersistWebhookEvent = vi.fn();
const mockQueueAdd = vi.fn();
const mockGetWebhookQueue = vi.fn();

vi.mock("~/lib/hmac.server", () => ({
  verifyShopifyHmac: (...args: unknown[]) => mockVerifyShopifyHmac(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopByDomain: (...args: unknown[]) => mockFindShopByDomain(...args),
  deactivateShop: (...args: unknown[]) => mockDeactivateShop(...args),
}));

vi.mock("~/models/webhook-event.server", () => ({
  persistWebhookEvent: (...args: unknown[]) =>
    mockPersistWebhookEvent(...args),
}));

vi.mock("~/queues/webhook.server", () => ({
  getWebhookQueue: (...args: unknown[]) => mockGetWebhookQueue(...args),
}));

import { action } from "~/routes/webhooks.shopify";

const ALL_HEADERS: Record<string, string> = {
  "X-Shopify-Topic": "checkouts/create",
  "X-Shopify-Shop-Domain": "test-store.myshopify.com",
  "X-Shopify-API-Version": "2024-01",
  "X-Shopify-Webhook-Id": "wh-001",
  "X-Shopify-Event-Id": "evt-001",
  "X-Shopify-Triggered-At": "2026-03-10T12:00:00Z",
  "X-Shopify-Hmac-SHA256": "valid-hmac",
};

function buildRequest(
  payload: Record<string, unknown> = {},
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
  return new Request("http://localhost:3000/webhooks/shopify", {
    method,
    headers: reqHeaders,
    body: method !== "GET" ? JSON.stringify(payload) : undefined,
  });
}

const savedEnv: Record<string, string | undefined> = {};

describe("webhooks.shopify action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mockVerifyShopifyHmac.mockReturnValue(true);
    mockFindShopByDomain.mockResolvedValue({ id: 10, shopDomain: "test-store.myshopify.com" });
    mockPersistWebhookEvent.mockResolvedValue({
      event: { id: 42 },
      isDuplicate: false,
    });
    mockDeactivateShop.mockResolvedValue(undefined);
    mockQueueAdd.mockResolvedValue(undefined);
    mockGetWebhookQueue.mockReturnValue({ add: mockQueueAdd });
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

    it("returns 400 when required headers are missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Topic"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Missing webhook headers");
    });

    it("returns 400 when shop domain header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Shop-Domain"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when HMAC header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Hmac-SHA256"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when webhook ID header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Webhook-Id"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when event ID header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Event-Id"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when triggered-at header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-Triggered-At"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });

    it("returns 400 when API version header is missing", async () => {
      const request = buildRequest({}, { omitHeaders: ["X-Shopify-API-Version"] });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(400);
    });
  });

  describe("HMAC verification", () => {
    it("returns 500 when SHOPIFY_API_SECRET is not configured", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      delete process.env.SHOPIFY_API_SECRET;
      const request = buildRequest({ id: 1 });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(500);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Server misconfigured");
      consoleSpy.mockRestore();
    });

    it("returns 401 when HMAC is invalid", async () => {
      mockVerifyShopifyHmac.mockReturnValue(false);
      const request = buildRequest({ id: 1 });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(401);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Invalid HMAC");
    });

    it("passes raw body, HMAC header, and secret to verifyShopifyHmac", async () => {
      const payload = { checkout_id: 123 };
      const request = buildRequest(payload);
      await action({ request, params: {}, context: {} });

      expect(mockVerifyShopifyHmac).toHaveBeenCalledWith(
        JSON.stringify(payload),
        "valid-hmac",
        "test-secret"
      );
    });
  });

  describe("shop lookup", () => {
    it("returns 404 when shop is not found", async () => {
      mockFindShopByDomain.mockResolvedValue(null);
      const request = buildRequest({ id: 1 });
      const response = await action({ request, params: {}, context: {} });
      expect(response.status).toBe(404);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("Shop not found");
    });

    it("looks up shop by domain from header", async () => {
      const request = buildRequest({ id: 1 });
      await action({ request, params: {}, context: {} });

      expect(mockFindShopByDomain).toHaveBeenCalledWith(
        "test-store.myshopify.com"
      );
    });
  });

  describe("event persistence", () => {
    it("persists webhook event with correct params", async () => {
      const payload = { checkout_id: 456 };
      const request = buildRequest(payload);
      await action({ request, params: {}, context: {} });

      expect(mockPersistWebhookEvent).toHaveBeenCalledWith({
        shopId: 10,
        headers: {
          topic: "checkouts/create",
          shopDomain: "test-store.myshopify.com",
          apiVersion: "2024-01",
          webhookId: "wh-001",
          eventId: "evt-001",
          triggeredAt: "2026-03-10T12:00:00Z",
          hmac: "valid-hmac",
        },
        payload: { checkout_id: 456 },
        hmacValid: true,
      });
    });
  });

  describe("app/uninstalled topic", () => {
    it("deactivates shop and returns ok", async () => {
      const headers = { ...ALL_HEADERS, "X-Shopify-Topic": "app/uninstalled" };
      const request = buildRequest({}, { headers });
      const response = await action({ request, params: {}, context: {} });

      expect(mockDeactivateShop).toHaveBeenCalledWith(
        "test-store.myshopify.com"
      );
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
    });

    it("does not enqueue when topic is app/uninstalled", async () => {
      const headers = { ...ALL_HEADERS, "X-Shopify-Topic": "app/uninstalled" };
      const request = buildRequest({}, { headers });
      await action({ request, params: {}, context: {} });

      expect(mockGetWebhookQueue).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("queue enqueueing", () => {
    it("enqueues non-duplicate events to webhook queue", async () => {
      mockPersistWebhookEvent.mockResolvedValue({
        event: { id: 99 },
        isDuplicate: false,
      });
      const request = buildRequest({ id: 1 });
      await action({ request, params: {}, context: {} });

      expect(mockGetWebhookQueue).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalledWith("webhook-99", {
        webhookEventId: 99,
        shopId: 10,
        topic: "checkouts/create",
      });
    });

    it("skips enqueueing for duplicate events", async () => {
      mockPersistWebhookEvent.mockResolvedValue({
        event: { id: 99 },
        isDuplicate: true,
      });
      const request = buildRequest({ id: 1 });
      await action({ request, params: {}, context: {} });

      expect(mockGetWebhookQueue).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("returns ok after successful processing", async () => {
      const request = buildRequest({ id: 1 });
      const response = await action({ request, params: {}, context: {} });

      const data = (await response.json()) as Record<string, unknown>;
      expect(data.ok).toBe(true);
    });
  });

  describe("header extraction", () => {
    it("extracts all Shopify headers and passes to persistWebhookEvent", async () => {
      const customHeaders = {
        "X-Shopify-Topic": "orders/paid",
        "X-Shopify-Shop-Domain": "another-store.myshopify.com",
        "X-Shopify-API-Version": "2024-04",
        "X-Shopify-Webhook-Id": "wh-custom",
        "X-Shopify-Event-Id": "evt-custom",
        "X-Shopify-Triggered-At": "2026-06-15T08:30:00Z",
        "X-Shopify-Hmac-SHA256": "custom-hmac",
      };
      mockFindShopByDomain.mockResolvedValue({ id: 25, shopDomain: "another-store.myshopify.com" });
      const request = buildRequest({}, { headers: customHeaders });
      await action({ request, params: {}, context: {} });

      expect(mockPersistWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 25,
          headers: {
            topic: "orders/paid",
            shopDomain: "another-store.myshopify.com",
            apiVersion: "2024-04",
            webhookId: "wh-custom",
            eventId: "evt-custom",
            triggeredAt: "2026-06-15T08:30:00Z",
            hmac: "custom-hmac",
          },
        })
      );
    });

    it("uses topic from header for queue job data", async () => {
      const headers = { ...ALL_HEADERS, "X-Shopify-Topic": "order_transactions/create" };
      const request = buildRequest({}, { headers });
      await action({ request, params: {}, context: {} });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ topic: "order_transactions/create" })
      );
    });
  });
});
