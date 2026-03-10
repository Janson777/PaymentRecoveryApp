import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockRecoveryCaseCount = vi.fn();
const mockRecoveryMessageCount = vi.fn();
const mockCheckoutAggregate = vi.fn();
const mockCheckoutFindFirst = vi.fn();

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
  });
});
