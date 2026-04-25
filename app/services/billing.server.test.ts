import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Shop } from "@prisma/client";

const mockShopifyGraphQL = vi.fn();
const mockUpdateShopPlan = vi.fn();

vi.mock("~/services/shopify-api.server", () => ({
  shopifyGraphQL: (...args: unknown[]) => mockShopifyGraphQL(...args),
  BILLING_MUTATIONS: {
    appSubscriptionCreate: "mutation AppSubscriptionCreate { ... }",
  },
  BILLING_QUERIES: {
    getSubscription: "query GetSubscription { ... }",
  },
}));

vi.mock("~/models/shop.server", () => ({
  updateShopPlan: (...args: unknown[]) => mockUpdateShopPlan(...args),
}));

import {
  createProSubscription,
  verifySubscription,
  activateProPlan,
  deactivateProPlan,
  mapSubscriptionStatusToPlan,
  PRO_PLAN,
} from "./billing.server";

const mockShop = {
  id: 10,
  shopDomain: "test.myshopify.com",
  accessTokenEncrypted: "encrypted",
  planTier: "FREE",
} as Shop;

describe("billing.server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUpdateShopPlan.mockResolvedValue(undefined);
  });

  describe("PRO_PLAN", () => {
    it("has correct plan details", () => {
      expect(PRO_PLAN.name).toBe("Pro");
      expect(PRO_PLAN.price).toBe("39.00");
      expect(PRO_PLAN.currencyCode).toBe("USD");
      expect(PRO_PLAN.interval).toBe("EVERY_30_DAYS");
    });
  });

  describe("createProSubscription", () => {
    it("calls shopifyGraphQL with correct mutation and variables", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        appSubscriptionCreate: {
          userErrors: [],
          appSubscription: { id: "gid://shopify/AppSubscription/1", status: "PENDING" },
          confirmationUrl: "https://admin.shopify.com/charges/confirm",
        },
      });

      await createProSubscription(mockShop, "https://myapp.com/billing/callback");

      expect(mockShopifyGraphQL).toHaveBeenCalledWith(
        mockShop,
        "mutation AppSubscriptionCreate { ... }",
        expect.objectContaining({
          name: "Pro",
          returnUrl: "https://myapp.com/billing/callback",
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: 39, currencyCode: "USD" },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        })
      );
    });

    it("returns confirmationUrl on success", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        appSubscriptionCreate: {
          userErrors: [],
          appSubscription: { id: "gid://shopify/AppSubscription/1", status: "PENDING" },
          confirmationUrl: "https://admin.shopify.com/charges/confirm",
        },
      });

      const result = await createProSubscription(mockShop, "https://myapp.com/billing/callback");

      expect(result.confirmationUrl).toBe("https://admin.shopify.com/charges/confirm");
    });

    it("throws when userErrors are present", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        appSubscriptionCreate: {
          userErrors: [
            { field: "name", message: "Name is required" },
            { field: "price", message: "Price is invalid" },
          ],
          appSubscription: null,
          confirmationUrl: null,
        },
      });

      await expect(
        createProSubscription(mockShop, "https://myapp.com/billing/callback")
      ).rejects.toThrow("Shopify billing error: Name is required, Price is invalid");
    });

    it("throws when confirmationUrl is null", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        appSubscriptionCreate: {
          userErrors: [],
          appSubscription: { id: "gid://shopify/AppSubscription/1", status: "PENDING" },
          confirmationUrl: null,
        },
      });

      await expect(
        createProSubscription(mockShop, "https://myapp.com/billing/callback")
      ).rejects.toThrow("No confirmation URL returned from Shopify");
    });

    it("sets test flag based on NODE_ENV", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        appSubscriptionCreate: {
          userErrors: [],
          appSubscription: { id: "gid://shopify/AppSubscription/1", status: "PENDING" },
          confirmationUrl: "https://admin.shopify.com/charges/confirm",
        },
      });

      await createProSubscription(mockShop, "https://myapp.com/billing/callback");

      const variables = mockShopifyGraphQL.mock.calls[0][2] as Record<string, unknown>;
      expect(variables.test).toBe(true);
    });
  });

  describe("verifySubscription", () => {
    it("calls shopifyGraphQL with subscription GID", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        node: {
          id: "gid://shopify/AppSubscription/123",
          name: "Pro",
          status: "ACTIVE",
          createdAt: "2026-03-10T12:00:00Z",
        },
      });

      await verifySubscription(mockShop, "gid://shopify/AppSubscription/123");

      expect(mockShopifyGraphQL).toHaveBeenCalledWith(
        mockShop,
        "query GetSubscription { ... }",
        { id: "gid://shopify/AppSubscription/123" }
      );
    });

    it("returns subscription details on success", async () => {
      mockShopifyGraphQL.mockResolvedValue({
        node: {
          id: "gid://shopify/AppSubscription/123",
          name: "Pro",
          status: "ACTIVE",
          createdAt: "2026-03-10T12:00:00Z",
        },
      });

      const result = await verifySubscription(mockShop, "gid://shopify/AppSubscription/123");

      expect(result).toEqual({
        id: "gid://shopify/AppSubscription/123",
        status: "ACTIVE",
        name: "Pro",
      });
    });

    it("throws when subscription node is null", async () => {
      mockShopifyGraphQL.mockResolvedValue({ node: null });

      await expect(
        verifySubscription(mockShop, "gid://shopify/AppSubscription/999")
      ).rejects.toThrow("Subscription gid://shopify/AppSubscription/999 not found");
    });
  });

  describe("activateProPlan", () => {
    it("calls updateShopPlan with PRO tier and subscription GID", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await activateProPlan(10, "gid://shopify/AppSubscription/123");

      expect(mockUpdateShopPlan).toHaveBeenCalledWith(
        10,
        "PRO",
        "gid://shopify/AppSubscription/123",
        expect.any(Date)
      );
      logSpy.mockRestore();
    });

    it("logs the upgrade", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await activateProPlan(10, "gid://shopify/AppSubscription/123");

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Shop 10 upgraded to PRO")
      );
      logSpy.mockRestore();
    });
  });

  describe("deactivateProPlan", () => {
    it("calls updateShopPlan with FREE tier and null billing fields", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await deactivateProPlan(10);

      expect(mockUpdateShopPlan).toHaveBeenCalledWith(10, "FREE", null, null);
      logSpy.mockRestore();
    });

    it("logs the downgrade", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await deactivateProPlan(10);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Shop 10 downgraded to FREE")
      );
      logSpy.mockRestore();
    });
  });

  describe("mapSubscriptionStatusToPlan", () => {
    it("maps ACTIVE to PRO", () => {
      expect(mapSubscriptionStatusToPlan("ACTIVE")).toBe("PRO");
    });

    it("maps CANCELLED to FREE", () => {
      expect(mapSubscriptionStatusToPlan("CANCELLED")).toBe("FREE");
    });

    it("maps EXPIRED to FREE", () => {
      expect(mapSubscriptionStatusToPlan("EXPIRED")).toBe("FREE");
    });

    it("maps DECLINED to FREE", () => {
      expect(mapSubscriptionStatusToPlan("DECLINED")).toBe("FREE");
    });

    it("maps FROZEN to FREE", () => {
      expect(mapSubscriptionStatusToPlan("FROZEN")).toBe("FREE");
    });

    it("maps unknown status to FREE", () => {
      expect(mapSubscriptionStatusToPlan("PENDING")).toBe("FREE");
      expect(mapSubscriptionStatusToPlan("UNKNOWN")).toBe("FREE");
    });
  });
});
