import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockRequireShopId = vi.fn();
const mockFindShopById = vi.fn();
const mockCreateProSubscription = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/services/billing.server", () => ({
  createProSubscription: (...args: unknown[]) =>
    mockCreateProSubscription(...args),
}));

import { loader, action } from "~/routes/billing.subscribe";

const savedEnv: Record<string, string | undefined> = {};

function buildPostRequest(): Request {
  return new Request("http://localhost:3000/billing/subscribe", {
    method: "POST",
  });
}

function buildGetRequest(): Request {
  return new Request("http://localhost:3000/billing/subscribe");
}

describe("billing.subscribe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.APP_URL = process.env.APP_URL;
    process.env.APP_URL = "https://myapp.example.com";
    mockRequireShopId.mockResolvedValue(10);
    mockFindShopById.mockResolvedValue({
      id: 10,
      shopDomain: "test.myshopify.com",
      planTier: "FREE",
    });
    mockCreateProSubscription.mockResolvedValue({
      confirmationUrl: "https://admin.shopify.com/charges/123/confirm",
    });
  });

  afterAll(() => {
    if (savedEnv.APP_URL === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = savedEnv.APP_URL;
    }
  });

  describe("loader", () => {
    it("redirects GET requests to /dashboard/settings", async () => {
      const request = buildGetRequest();
      const response = await loader({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/settings");
    });
  });

  describe("action", () => {
    it("throws 401 when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );
      const request = buildPostRequest();

      try {
        await action({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("throws 404 when shop is not found", async () => {
      mockFindShopById.mockResolvedValue(null);
      const request = buildPostRequest();

      try {
        await action({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("redirects to /dashboard/settings when already on PRO plan", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        shopDomain: "test.myshopify.com",
        planTier: "PRO",
      });
      const request = buildPostRequest();
      const response = await action({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/settings");
      expect(mockCreateProSubscription).not.toHaveBeenCalled();
    });

    it("calls createProSubscription with shop and return URL", async () => {
      const request = buildPostRequest();
      await action({ request, params: {}, context: {} });

      expect(mockCreateProSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, planTier: "FREE" }),
        "https://myapp.example.com/billing/callback"
      );
    });

    it("redirects to Shopify confirmation URL on success", async () => {
      const request = buildPostRequest();
      const response = await action({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://admin.shopify.com/charges/123/confirm"
      );
    });

    it("uses APP_URL env var for return URL", async () => {
      process.env.APP_URL = "https://custom-app.example.com";
      const request = buildPostRequest();
      await action({ request, params: {}, context: {} });

      expect(mockCreateProSubscription).toHaveBeenCalledWith(
        expect.any(Object),
        "https://custom-app.example.com/billing/callback"
      );
    });

    it("falls back to localhost when APP_URL is not set", async () => {
      delete process.env.APP_URL;
      const request = buildPostRequest();
      await action({ request, params: {}, context: {} });

      expect(mockCreateProSubscription).toHaveBeenCalledWith(
        expect.any(Object),
        "http://localhost:3000/billing/callback"
      );
    });

    it("throws when createProSubscription fails", async () => {
      mockCreateProSubscription.mockRejectedValue(
        new Error("Shopify API error: something went wrong")
      );
      const request = buildPostRequest();

      await expect(
        action({ request, params: {}, context: {} })
      ).rejects.toThrow("Shopify API error: something went wrong");
    });

    it("calls findShopById with the authenticated shopId", async () => {
      mockRequireShopId.mockResolvedValue(42);
      mockFindShopById.mockResolvedValue({
        id: 42,
        shopDomain: "shop42.myshopify.com",
        planTier: "FREE",
      });
      const request = buildPostRequest();
      await action({ request, params: {}, context: {} });

      expect(mockFindShopById).toHaveBeenCalledWith(42);
    });
  });
});
