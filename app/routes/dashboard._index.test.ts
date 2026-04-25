import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockRecoveryCaseCount = vi.fn();
const mockRecoveryMessageCount = vi.fn();
const mockCheckoutAggregate = vi.fn();
const mockCheckoutFindFirst = vi.fn();
const mockFindShopById = vi.fn();
const mockGetMonthlyUsageCount = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/lib/db.server", () => ({
  prisma: {
    recoveryCase: {
      count: (...args: unknown[]) => mockRecoveryCaseCount(...args),
    },
    recoveryMessage: {
      count: (...args: unknown[]) => mockRecoveryMessageCount(...args),
    },
    checkout: {
      aggregate: (...args: unknown[]) => mockCheckoutAggregate(...args),
      findFirst: (...args: unknown[]) => mockCheckoutFindFirst(...args),
    },
  },
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/lib/plan.server", () => ({
  getMonthlyUsageCount: (...args: unknown[]) => mockGetMonthlyUsageCount(...args),
  FREE_CASES_LIMIT: 100,
}));

import { loader } from "~/routes/dashboard._index";

function buildRequest(): Request {
  return new Request("http://localhost:3000/dashboard");
}

describe("dashboard._index", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockRecoveryCaseCount
      .mockResolvedValueOnce(100) // totalCases
      .mockResolvedValueOnce(25) // recoveredCases
      .mockResolvedValueOnce(30) // activeCases
      .mockResolvedValueOnce(50) // casesMessaged
      .mockResolvedValueOnce(20); // casesClicked
    mockRecoveryMessageCount.mockResolvedValue(75);
    mockCheckoutAggregate.mockResolvedValue({
      _sum: { totalAmount: 5000 },
    });
    mockCheckoutFindFirst.mockResolvedValue({ currency: "EUR" });
    mockFindShopById.mockResolvedValue({
      id: 10,
      planTier: "FREE",
      settingsJson: {},
      shopDomain: "test-shop.myshopify.com",
    });
    mockGetMonthlyUsageCount.mockResolvedValue(42);
  });

  describe("loader", () => {
    it("throws when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );

      try {
        await loader({ request: buildRequest(), params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("returns all metric fields", async () => {
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data).toHaveProperty("totalCases");
      expect(data).toHaveProperty("recoveredCases");
      expect(data).toHaveProperty("activeCases");
      expect(data).toHaveProperty("messagesSent");
      expect(data).toHaveProperty("recoveryRate");
      expect(data).toHaveProperty("recoveredRevenue");
      expect(data).toHaveProperty("currency");
      expect(data).toHaveProperty("casesMessaged");
      expect(data).toHaveProperty("casesClicked");
      expect(data).toHaveProperty("planTier");
      expect(data).toHaveProperty("monthlyUsage");
      expect(data).toHaveProperty("maxCasesPerMonth");
      expect(data).toHaveProperty("smsEnabled");
      expect(data).toHaveProperty("shopDomain");
    });

    it("computes recovery rate from total and recovered cases", async () => {
      mockRecoveryCaseCount
        .mockReset()
        .mockResolvedValueOnce(200) // totalCases
        .mockResolvedValueOnce(50) // recoveredCases
        .mockResolvedValueOnce(10) // activeCases
        .mockResolvedValueOnce(30) // casesMessaged
        .mockResolvedValueOnce(15); // casesClicked

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.recoveryRate).toBe(25); // 50/200 * 100
    });

    it("returns zero recovery rate when no cases exist", async () => {
      mockRecoveryCaseCount
        .mockReset()
        .mockResolvedValueOnce(0) // totalCases
        .mockResolvedValueOnce(0) // recoveredCases
        .mockResolvedValueOnce(0) // activeCases
        .mockResolvedValueOnce(0) // casesMessaged
        .mockResolvedValueOnce(0); // casesClicked

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.recoveryRate).toBe(0);
    });

    it("uses shop currency from checkout", async () => {
      mockCheckoutFindFirst.mockResolvedValue({ currency: "GBP" });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.currency).toBe("GBP");
    });

    it("defaults currency to USD when no checkout has currency", async () => {
      mockCheckoutFindFirst.mockResolvedValue(null);

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.currency).toBe("USD");
    });

    it("computes recovered revenue from aggregate", async () => {
      mockCheckoutAggregate.mockResolvedValue({
        _sum: { totalAmount: 12345.67 },
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.recoveredRevenue).toBe(12345.67);
    });

    it("handles null revenue aggregate", async () => {
      mockCheckoutAggregate.mockResolvedValue({
        _sum: { totalAmount: null },
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.recoveredRevenue).toBe(0);
    });

    it("returns correct count values", async () => {
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.totalCases).toBe(100);
      expect(data.recoveredCases).toBe(25);
      expect(data.activeCases).toBe(30);
      expect(data.messagesSent).toBe(75);
    });

    it("returns planTier as FREE for free shops", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "FREE",
        settingsJson: {},
        shopDomain: "test-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.planTier).toBe("FREE");
    });

    it("returns planTier as PRO for pro shops", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "PRO",
        settingsJson: {},
        shopDomain: "test-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.planTier).toBe("PRO");
    });

    it("returns smsEnabled=true when settings enable SMS", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "PRO",
        settingsJson: { smsEnabled: true },
        shopDomain: "test-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.smsEnabled).toBe(true);
    });

    it("returns smsEnabled=false when settings disable SMS", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "PRO",
        settingsJson: { smsEnabled: false },
        shopDomain: "test-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.smsEnabled).toBe(false);
    });

    it("defaults smsEnabled to false when settingsJson is missing", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "PRO",
        settingsJson: null,
        shopDomain: "test-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.smsEnabled).toBe(false);
    });

    it("returns shopDomain from the shop record", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        planTier: "PRO",
        settingsJson: {},
        shopDomain: "acme.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.shopDomain).toBe("acme.myshopify.com");
    });

    it("defaults shopDomain to empty string when shop is null", async () => {
      mockFindShopById.mockResolvedValue(null);

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.shopDomain).toBe("");
      expect(data.smsEnabled).toBe(false);
    });

    it("defaults planTier to FREE when shop is null", async () => {
      mockFindShopById.mockResolvedValue(null);

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.planTier).toBe("FREE");
    });

    it("returns monthlyUsage from plan helper", async () => {
      mockGetMonthlyUsageCount.mockResolvedValue(85);

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.monthlyUsage).toBe(85);
    });
  });
});
