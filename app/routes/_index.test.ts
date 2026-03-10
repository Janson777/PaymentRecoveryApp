import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetShopId = vi.fn();

vi.mock("~/lib/session.server", () => ({
  getShopId: (...args: unknown[]) => mockGetShopId(...args),
}));

import { loader } from "~/routes/_index";

function buildRequest(): Request {
  return new Request("http://localhost:3000/");
}

describe("_index", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("loader", () => {
    it("redirects to /dashboard when user is authenticated", async () => {
      mockGetShopId.mockResolvedValue(10);
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get("Location")).toBe(
        "/dashboard"
      );
    });

    it("returns null when user is not authenticated", async () => {
      mockGetShopId.mockResolvedValue(null);
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });

      expect(response).toBeNull();
    });

    it("passes request to getShopId", async () => {
      mockGetShopId.mockResolvedValue(null);
      const request = buildRequest();
      await loader({ request, params: {}, context: {} });

      expect(mockGetShopId).toHaveBeenCalledWith(request);
    });
  });
});
