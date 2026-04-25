import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaseStatus } from "@prisma/client";

const mockRequireShopId = vi.fn();
const mockGetCasesByShop = vi.fn();
const mockFindShopById = vi.fn();
const mockGetMonthlyUsageCount = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCasesByShop: (...args: unknown[]) => mockGetCasesByShop(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/lib/plan.server", () => ({
  getMonthlyUsageCount: (...args: unknown[]) => mockGetMonthlyUsageCount(...args),
  FREE_CASES_LIMIT: 100,
}));

import { loader } from "~/routes/dashboard.cases._index";

function buildRequest(status?: string): Request {
  const url = new URL("http://localhost:3000/dashboard/cases");
  if (status) url.searchParams.set("status", status);
  return new Request(url.toString());
}

describe("dashboard.cases", () => {
  const mockCases = [
    { id: 1, caseStatus: CaseStatus.MESSAGING },
    { id: 2, caseStatus: CaseStatus.RECOVERED },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockGetCasesByShop.mockResolvedValue(mockCases);
    mockFindShopById.mockResolvedValue({ id: 10, planTier: "FREE" });
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

    it("calls getCasesByShop with undefined statuses when no filter", async () => {
      await loader({ request: buildRequest(), params: {}, context: {} });

      expect(mockGetCasesByShop).toHaveBeenCalledWith(10, undefined);
    });

    it("returns cases from getCasesByShop", async () => {
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.cases).toEqual(mockCases);
    });

    it("parses comma-separated status filter", async () => {
      await loader({
        request: buildRequest("CANDIDATE,READY,MESSAGING"),
        params: {},
        context: {},
      });

      expect(mockGetCasesByShop).toHaveBeenCalledWith(10, [
        CaseStatus.CANDIDATE,
        CaseStatus.READY,
        CaseStatus.MESSAGING,
      ]);
    });

    it("filters out invalid status values", async () => {
      await loader({
        request: buildRequest("RECOVERED,INVALID_STATUS,EXPIRED"),
        params: {},
        context: {},
      });

      expect(mockGetCasesByShop).toHaveBeenCalledWith(10, [
        CaseStatus.RECOVERED,
        CaseStatus.EXPIRED,
      ]);
    });

    it("passes single status value", async () => {
      await loader({
        request: buildRequest("RECOVERED"),
        params: {},
        context: {},
      });

      expect(mockGetCasesByShop).toHaveBeenCalledWith(10, [
        CaseStatus.RECOVERED,
      ]);
    });

    it("uses authenticated shopId for query", async () => {
      mockRequireShopId.mockResolvedValue(77);
      await loader({ request: buildRequest(), params: {}, context: {} });

      expect(mockGetCasesByShop).toHaveBeenCalledWith(77, undefined);
    });

    it("returns planTier FREE when shop has no planTier", async () => {
      mockFindShopById.mockResolvedValue(null);
      const response = await loader({ request: buildRequest(), params: {}, context: {} });
      const data = await response.json();

      expect(data.planTier).toBe("FREE");
    });

    it("returns planTier PRO when shop is PRO", async () => {
      mockFindShopById.mockResolvedValue({ id: 10, planTier: "PRO" });
      const response = await loader({ request: buildRequest(), params: {}, context: {} });
      const data = await response.json();

      expect(data.planTier).toBe("PRO");
    });

    it("returns monthlyUsage from getMonthlyUsageCount", async () => {
      mockGetMonthlyUsageCount.mockResolvedValue(85);
      const response = await loader({ request: buildRequest(), params: {}, context: {} });
      const data = await response.json();

      expect(data.monthlyUsage).toBe(85);
    });

    it("returns maxCasesPerMonth from FREE_CASES_LIMIT", async () => {
      const response = await loader({ request: buildRequest(), params: {}, context: {} });
      const data = await response.json();

      expect(data.maxCasesPerMonth).toBe(100);
    });
  });
});
