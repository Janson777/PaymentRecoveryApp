import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCaseById = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("~/models/recovery-case.server", () => ({
  getCaseById: (...args: unknown[]) => mockGetCaseById(...args),
}));

vi.mock("~/lib/db.server", () => ({
  prisma: {
    recoveryMessage: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

import { loader } from "~/routes/r.$caseId";

function buildRequest(): Request {
  return new Request("http://localhost:3000/r/42");
}

describe("r.$caseId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetCaseById.mockResolvedValue({
      id: 42,
      checkout: {
        recoveryUrl: "https://store.myshopify.com/checkout/recover/abc123",
      },
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("loader", () => {
    it("throws 400 for invalid caseId", async () => {
      try {
        await loader({
          request: buildRequest(),
          params: { caseId: "not-a-number" },
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
          params: { caseId: "999" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("throws 404 when checkout has no recovery URL", async () => {
      mockGetCaseById.mockResolvedValue({
        id: 42,
        checkout: { recoveryUrl: null },
      });

      try {
        await loader({
          request: buildRequest(),
          params: { caseId: "42" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("throws 404 when checkout is null", async () => {
      mockGetCaseById.mockResolvedValue({
        id: 42,
        checkout: null,
      });

      try {
        await loader({
          request: buildRequest(),
          params: { caseId: "42" },
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("tracks clicks by updating unclicked sent messages", async () => {
      await loader({
        request: buildRequest(),
        params: { caseId: "42" },
        context: {},
      });

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          recoveryCaseId: 42,
          sentAt: { not: null },
          clickedAt: null,
        },
        data: { clickedAt: expect.any(Date) },
      });
    });

    it("redirects to the checkout recovery URL", async () => {
      const response = await loader({
        request: buildRequest(),
        params: { caseId: "42" },
        context: {},
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://store.myshopify.com/checkout/recover/abc123"
      );
    });

    it("calls getCaseById with parsed numeric ID", async () => {
      await loader({
        request: buildRequest(),
        params: { caseId: "77" },
        context: {},
      });

      expect(mockGetCaseById).toHaveBeenCalledWith(77);
    });
  });
});
