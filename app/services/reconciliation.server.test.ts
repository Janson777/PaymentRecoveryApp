import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Shop } from "@prisma/client";

const mockShopifyGraphQL = vi.fn();
const mockFindCheckoutByShopifyId = vi.fn();
const mockMarkCheckoutAbandoned = vi.fn();
const mockMarkCheckoutRecovered = vi.fn();
const mockEvaluateAbandonedCheckout = vi.fn();
const mockExpireOldCases = vi.fn();
const mockPromoteReadyCases = vi.fn();
const mockGetActiveShops = vi.fn();
const mockFindShopById = vi.fn();
const mockQueueAdd = vi.fn();
const mockGetReconciliationQueue = vi.fn();

vi.mock("./shopify-api.server", () => ({
  shopifyGraphQL: (...args: unknown[]) => mockShopifyGraphQL(...args),
  QUERIES: { abandonedCheckouts: "query AbandonedCheckouts { }" },
}));

vi.mock("~/models/checkout.server", () => ({
  findCheckoutByShopifyId: (...args: unknown[]) =>
    mockFindCheckoutByShopifyId(...args),
  markCheckoutAbandoned: (...args: unknown[]) =>
    mockMarkCheckoutAbandoned(...args),
  markCheckoutRecovered: (...args: unknown[]) =>
    mockMarkCheckoutRecovered(...args),
}));

vi.mock("./decline-detection.server", () => ({
  evaluateAbandonedCheckout: (...args: unknown[]) =>
    mockEvaluateAbandonedCheckout(...args),
}));

vi.mock("./recovery-workflow.server", () => ({
  expireOldCases: (...args: unknown[]) => mockExpireOldCases(...args),
  promoteReadyCases: (...args: unknown[]) => mockPromoteReadyCases(...args),
}));

vi.mock("~/models/shop.server", () => ({
  getActiveShops: (...args: unknown[]) => mockGetActiveShops(...args),
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/queues/reconciliation.server", () => ({
  getReconciliationQueue: (...args: unknown[]) =>
    mockGetReconciliationQueue(...args),
}));

import {
  processReconciliation,
  scheduleReconciliationJobs,
} from "./reconciliation.server";

const mockShop: Shop = {
  id: 10,
  shopDomain: "test-store.myshopify.com",
  accessTokenEncrypted: "encrypted",
  isActive: true,
  apiVersion: "2024-10",
  settingsJson: null,
  installedAt: new Date(),
  uninstalledAt: null,
} as Shop;

function buildAbandonedCheckoutNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/AbandonedCheckout/123456",
    createdAt: "2026-03-01T12:00:00Z",
    updatedAt: "2026-03-02T12:00:00Z",
    completedAt: null,
    abandonedCheckoutUrl: "https://test-store.myshopify.com/checkouts/recover/abc",
    totalPriceSet: {
      shopMoney: { amount: "99.99", currencyCode: "USD" },
    },
    customer: {
      id: "gid://shopify/Customer/789",
      email: "customer@example.com",
      phone: "+15551234567",
    },
    ...overrides,
  };
}

function buildGraphQLResponse(nodes: Record<string, unknown>[] = []) {
  return {
    abandonedCheckouts: {
      edges: nodes.map((node) => ({ node })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

describe("processReconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMarkCheckoutAbandoned.mockResolvedValue(undefined);
    mockMarkCheckoutRecovered.mockResolvedValue(undefined);
    mockEvaluateAbandonedCheckout.mockResolvedValue(undefined);
    mockExpireOldCases.mockResolvedValue(0);
    mockPromoteReadyCases.mockResolvedValue(0);
  });

  describe("routing", () => {
    it("routes abandoned_checkout to reconcileAbandonedCheckouts", async () => {
      mockFindShopById.mockResolvedValue(null);

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockFindShopById).toHaveBeenCalledWith(10);
    });

    it("routes orphan_reconciliation to reconcileOrphans", async () => {
      await processReconciliation({
        shopId: 0,
        jobType: "orphan_reconciliation",
      });

      expect(mockExpireOldCases).toHaveBeenCalled();
      expect(mockPromoteReadyCases).toHaveBeenCalled();
    });
  });

  describe("reconcileAbandonedCheckouts", () => {
    it("returns early when shop is not found", async () => {
      mockFindShopById.mockResolvedValue(null);

      await processReconciliation({
        shopId: 999,
        jobType: "abandoned_checkout",
      });

      expect(mockShopifyGraphQL).not.toHaveBeenCalled();
      expect(mockPromoteReadyCases).not.toHaveBeenCalled();
    });

    it("returns early when shop is inactive", async () => {
      mockFindShopById.mockResolvedValue({ ...mockShop, isActive: false });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockShopifyGraphQL).not.toHaveBeenCalled();
      expect(mockPromoteReadyCases).not.toHaveBeenCalled();
    });

    it("queries GraphQL with correct params", async () => {
      mockFindShopById.mockResolvedValue(mockShop);
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse());

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockShopifyGraphQL).toHaveBeenCalledWith(
        mockShop,
        "query AbandonedCheckouts { }",
        { first: 50 }
      );
    });

    it("calls promoteReadyCases after processing", async () => {
      mockFindShopById.mockResolvedValue(mockShop);
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse());

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockPromoteReadyCases).toHaveBeenCalled();
    });

    it("processes multiple checkout nodes", async () => {
      mockFindShopById.mockResolvedValue(mockShop);
      const node1 = buildAbandonedCheckoutNode({
        id: "gid://shopify/AbandonedCheckout/111",
      });
      const node2 = buildAbandonedCheckoutNode({
        id: "gid://shopify/AbandonedCheckout/222",
      });
      mockShopifyGraphQL.mockResolvedValue(
        buildGraphQLResponse([node1, node2])
      );
      mockFindCheckoutByShopifyId.mockResolvedValue(null);

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockFindCheckoutByShopifyId).toHaveBeenCalledTimes(2);
      expect(mockFindCheckoutByShopifyId).toHaveBeenCalledWith(10, "111");
      expect(mockFindCheckoutByShopifyId).toHaveBeenCalledWith(10, "222");
    });
  });

  describe("processAbandonedCheckoutNode", () => {
    beforeEach(() => {
      mockFindShopById.mockResolvedValue(mockShop);
    });

    it("extracts shopifyCheckoutId from GID string", async () => {
      const node = buildAbandonedCheckoutNode({
        id: "gid://shopify/AbandonedCheckout/987654",
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue(null);

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockFindCheckoutByShopifyId).toHaveBeenCalledWith(10, "987654");
    });

    it("skips when checkout is not found in DB", async () => {
      const node = buildAbandonedCheckoutNode();
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue(null);

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockMarkCheckoutRecovered).not.toHaveBeenCalled();
      expect(mockMarkCheckoutAbandoned).not.toHaveBeenCalled();
      expect(mockEvaluateAbandonedCheckout).not.toHaveBeenCalled();
    });

    it("marks checkout as recovered when completedAt is set", async () => {
      const node = buildAbandonedCheckoutNode({
        completedAt: "2026-03-03T12:00:00Z",
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockMarkCheckoutRecovered).toHaveBeenCalledWith(42);
      expect(mockMarkCheckoutAbandoned).not.toHaveBeenCalled();
      expect(mockEvaluateAbandonedCheckout).not.toHaveBeenCalled();
    });

    it("marks active checkout as abandoned and evaluates it", async () => {
      const node = buildAbandonedCheckoutNode();
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockMarkCheckoutAbandoned).toHaveBeenCalledWith(
        42,
        "https://test-store.myshopify.com/checkouts/recover/abc"
      );
      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith({
        shopId: 10,
        checkoutId: 42,
        hasContactInfo: true,
        hasShippingInfo: true,
        totalAmount: 99.99,
      });
    });

    it("sets hasContactInfo true when customer has email", async () => {
      const node = buildAbandonedCheckoutNode({
        customer: {
          id: "gid://shopify/Customer/1",
          email: "test@example.com",
          phone: null,
        },
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ hasContactInfo: true })
      );
    });

    it("sets hasContactInfo true when customer has phone only", async () => {
      const node = buildAbandonedCheckoutNode({
        customer: {
          id: "gid://shopify/Customer/1",
          email: null,
          phone: "+15551234567",
        },
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ hasContactInfo: true })
      );
    });

    it("sets hasContactInfo false when customer is null", async () => {
      const node = buildAbandonedCheckoutNode({ customer: null });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ hasContactInfo: false })
      );
    });

    it("sets hasContactInfo false when customer has no email or phone", async () => {
      const node = buildAbandonedCheckoutNode({
        customer: {
          id: "gid://shopify/Customer/1",
          email: null,
          phone: null,
        },
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ hasContactInfo: false })
      );
    });

    it("parses totalAmount from string to float", async () => {
      const node = buildAbandonedCheckoutNode({
        totalPriceSet: {
          shopMoney: { amount: "149.50", currencyCode: "USD" },
        },
      });
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ACTIVE",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockEvaluateAbandonedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 149.5 })
      );
    });

    it("does not process non-ACTIVE checkout without completedAt", async () => {
      const node = buildAbandonedCheckoutNode();
      mockShopifyGraphQL.mockResolvedValue(buildGraphQLResponse([node]));
      mockFindCheckoutByShopifyId.mockResolvedValue({
        id: 42,
        checkoutStatus: "ABANDONED",
      });

      await processReconciliation({
        shopId: 10,
        jobType: "abandoned_checkout",
      });

      expect(mockMarkCheckoutAbandoned).not.toHaveBeenCalled();
      expect(mockMarkCheckoutRecovered).not.toHaveBeenCalled();
      expect(mockEvaluateAbandonedCheckout).not.toHaveBeenCalled();
    });
  });

  describe("reconcileOrphans", () => {
    it("calls expireOldCases", async () => {
      await processReconciliation({
        shopId: 0,
        jobType: "orphan_reconciliation",
      });

      expect(mockExpireOldCases).toHaveBeenCalled();
    });

    it("calls promoteReadyCases", async () => {
      await processReconciliation({
        shopId: 0,
        jobType: "orphan_reconciliation",
      });

      expect(mockPromoteReadyCases).toHaveBeenCalled();
    });

    it("calls expireOldCases before promoteReadyCases", async () => {
      const callOrder: string[] = [];
      mockExpireOldCases.mockImplementation(() => {
        callOrder.push("expire");
        return Promise.resolve(0);
      });
      mockPromoteReadyCases.mockImplementation(() => {
        callOrder.push("promote");
        return Promise.resolve(0);
      });

      await processReconciliation({
        shopId: 0,
        jobType: "orphan_reconciliation",
      });

      expect(callOrder).toEqual(["expire", "promote"]);
    });
  });
});

describe("scheduleReconciliationJobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockQueueAdd.mockResolvedValue(undefined);
    mockGetReconciliationQueue.mockReturnValue({ add: mockQueueAdd });
  });

  it("schedules abandoned_checkout job for each active shop", async () => {
    mockGetActiveShops.mockResolvedValue([
      { id: 1, shopDomain: "shop1.myshopify.com" },
      { id: 2, shopDomain: "shop2.myshopify.com" },
    ]);

    await scheduleReconciliationJobs();

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "reconcile-abandoned-1",
      { shopId: 1, jobType: "abandoned_checkout" },
      {
        repeat: { every: 10 * 60_000 },
        jobId: "reconcile-abandoned-1",
      }
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "reconcile-abandoned-2",
      { shopId: 2, jobType: "abandoned_checkout" },
      {
        repeat: { every: 10 * 60_000 },
        jobId: "reconcile-abandoned-2",
      }
    );
  });

  it("schedules orphan_reconciliation job", async () => {
    mockGetActiveShops.mockResolvedValue([]);

    await scheduleReconciliationJobs();

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "reconcile-orphans",
      { shopId: 0, jobType: "orphan_reconciliation" },
      {
        repeat: { every: 30 * 60_000 },
        jobId: "reconcile-orphans",
      }
    );
  });

  it("uses 10-minute interval for abandoned checkout jobs", async () => {
    mockGetActiveShops.mockResolvedValue([{ id: 5 }]);

    await scheduleReconciliationJobs();

    const shopCall = mockQueueAdd.mock.calls.find(
      (call) => call[0] === "reconcile-abandoned-5"
    );
    expect(shopCall?.[2].repeat.every).toBe(600_000);
  });

  it("uses 30-minute interval for orphan reconciliation", async () => {
    mockGetActiveShops.mockResolvedValue([]);

    await scheduleReconciliationJobs();

    const orphanCall = mockQueueAdd.mock.calls.find(
      (call) => call[0] === "reconcile-orphans"
    );
    expect(orphanCall?.[2].repeat.every).toBe(1_800_000);
  });

  it("handles empty shop list (still schedules orphan job)", async () => {
    mockGetActiveShops.mockResolvedValue([]);

    await scheduleReconciliationJobs();

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "reconcile-orphans",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("gets queue from getReconciliationQueue", async () => {
    mockGetActiveShops.mockResolvedValue([]);

    await scheduleReconciliationJobs();

    expect(mockGetReconciliationQueue).toHaveBeenCalled();
  });
});
