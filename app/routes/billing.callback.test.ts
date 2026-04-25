import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockFindShopById = vi.fn();
const mockVerifySubscription = vi.fn();
const mockActivateProPlan = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/services/billing.server", () => ({
  verifySubscription: (...args: unknown[]) => mockVerifySubscription(...args),
  activateProPlan: (...args: unknown[]) => mockActivateProPlan(...args),
}));

import { loader } from "~/routes/billing.callback";

function buildRequest(chargeId?: string): Request {
  const url = chargeId
    ? `http://localhost:3000/billing/callback?charge_id=${encodeURIComponent(chargeId)}`
    : "http://localhost:3000/billing/callback";
  return new Request(url);
}

describe("billing.callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockFindShopById.mockResolvedValue({
      id: 10,
      shopDomain: "test.myshopify.com",
      planTier: "FREE",
    });
    mockVerifySubscription.mockResolvedValue({
      id: "gid://shopify/AppSubscription/123",
      status: "ACTIVE",
      name: "Pro",
    });
    mockActivateProPlan.mockResolvedValue(undefined);
  });

  describe("loader", () => {
    it("throws 401 when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );
      const request = buildRequest("123");

      try {
        await loader({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("throws 404 when shop is not found", async () => {
      mockFindShopById.mockResolvedValue(null);
      const request = buildRequest("123");

      try {
        await loader({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("redirects to /dashboard/settings when charge_id is missing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const request = buildRequest();
      const response = await loader({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/settings");
      expect(mockVerifySubscription).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("logs warning when charge_id is missing", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const request = buildRequest();
      await loader({ request, params: {}, context: {} });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("missing charge_id")
      );
      warnSpy.mockRestore();
    });

    it("converts numeric charge_id to GID format", async () => {
      const request = buildRequest("456789");
      await loader({ request, params: {}, context: {} });

      expect(mockVerifySubscription).toHaveBeenCalledWith(
        expect.any(Object),
        "gid://shopify/AppSubscription/456789"
      );
    });

    it("passes GID charge_id through unchanged", async () => {
      const gid = "gid://shopify/AppSubscription/789";
      const request = buildRequest(gid);
      await loader({ request, params: {}, context: {} });

      expect(mockVerifySubscription).toHaveBeenCalledWith(
        expect.any(Object),
        gid
      );
    });

    it("activates PRO plan when subscription is ACTIVE", async () => {
      mockVerifySubscription.mockResolvedValue({
        id: "gid://shopify/AppSubscription/123",
        status: "ACTIVE",
        name: "Pro",
      });
      const request = buildRequest("123");
      await loader({ request, params: {}, context: {} });

      expect(mockActivateProPlan).toHaveBeenCalledWith(
        10,
        "gid://shopify/AppSubscription/123"
      );
    });

    it("does not activate plan when subscription is not ACTIVE", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockVerifySubscription.mockResolvedValue({
        id: "gid://shopify/AppSubscription/123",
        status: "DECLINED",
        name: "Pro",
      });
      const request = buildRequest("123");
      await loader({ request, params: {}, context: {} });

      expect(mockActivateProPlan).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("logs warning when subscription status is not ACTIVE", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockVerifySubscription.mockResolvedValue({
        id: "gid://shopify/AppSubscription/123",
        status: "PENDING",
        name: "Pro",
      });
      const request = buildRequest("123");
      await loader({ request, params: {}, context: {} });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("has status: PENDING")
      );
      warnSpy.mockRestore();
    });

    it("always redirects to /dashboard/settings after processing", async () => {
      const request = buildRequest("123");
      const response = await loader({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/settings");
    });

    it("redirects to /dashboard/settings even when subscription is declined", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockVerifySubscription.mockResolvedValue({
        id: "gid://shopify/AppSubscription/123",
        status: "DECLINED",
        name: "Pro",
      });
      const request = buildRequest("123");
      const response = await loader({ request, params: {}, context: {} });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard/settings");
      warnSpy.mockRestore();
    });

    it("throws when verifySubscription fails", async () => {
      mockVerifySubscription.mockRejectedValue(
        new Error("Subscription not found")
      );
      const request = buildRequest("123");

      await expect(
        loader({ request, params: {}, context: {} })
      ).rejects.toThrow("Subscription not found");
    });

    it("calls findShopById with the authenticated shopId", async () => {
      mockRequireShopId.mockResolvedValue(77);
      mockFindShopById.mockResolvedValue({
        id: 77,
        shopDomain: "shop77.myshopify.com",
        planTier: "FREE",
      });
      const request = buildRequest("123");
      await loader({ request, params: {}, context: {} });

      expect(mockFindShopById).toHaveBeenCalledWith(77);
    });
  });
});
