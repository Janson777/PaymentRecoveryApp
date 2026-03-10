import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockGetCaseById = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCaseById: (...args: unknown[]) => mockGetCaseById(...args),
}));

import { loader } from "~/routes/dashboard.cases.$id";

function buildRequest(): Request {
  return new Request("http://localhost:3000/dashboard/cases/42");
}

describe("dashboard.cases.$id", () => {
  const mockCase = {
    id: 42,
    caseStatus: "MESSAGING",
    caseType: "CONFIRMED_DECLINE",
    confidenceScore: 85,
    openedAt: "2026-03-10T12:00:00Z",
    closedAt: null,
    closeReason: null,
    recoveryMessages: [],
    checkout: { email: "test@example.com", totalAmount: "99.99", currency: "USD" },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockGetCaseById.mockResolvedValue(mockCase);
  });

  describe("loader", () => {
    it("throws when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );

      try {
        await loader({
          request: buildRequest(),
          params: { id: "42" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("throws 400 for invalid (NaN) case ID", async () => {
      try {
        await loader({
          request: buildRequest(),
          params: { id: "not-a-number" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("throws 404 when case is not found", async () => {
      mockGetCaseById.mockResolvedValue(null);

      try {
        await loader({
          request: buildRequest(),
          params: { id: "999" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("calls getCaseById with parsed numeric ID", async () => {
      await loader({
        request: buildRequest(),
        params: { id: "42" },
        context: {},
      });

      expect(mockGetCaseById).toHaveBeenCalledWith(42);
    });

    it("returns recovery case on success", async () => {
      const response = await loader({
        request: buildRequest(),
        params: { id: "42" },
        context: {},
      });
      const data = await response.json();

      expect(data.recoveryCase).toEqual(mockCase);
    });
  });
});
