import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockFindShopById = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

import { loader } from "~/routes/dashboard";

function buildRequest(): Request {
  return new Request("http://localhost:3000/dashboard");
}

describe("dashboard layout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockFindShopById.mockResolvedValue({
      id: 10,
      shopDomain: "test-store.myshopify.com",
    });
  });

  describe("loader", () => {
    it("redirects to / when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    });

    it("redirects to / when shop is not found", async () => {
      mockFindShopById.mockResolvedValue(null);
      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    });

    it("calls findShopById with authenticated shopId", async () => {
      mockRequireShopId.mockResolvedValue(42);
      mockFindShopById.mockResolvedValue({
        id: 42,
        shopDomain: "my-store.myshopify.com",
      });

      await loader({ request: buildRequest(), params: {}, context: {} });

      expect(mockFindShopById).toHaveBeenCalledWith(42);
    });

    it("returns shopDomain on success", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        shopDomain: "my-shop.myshopify.com",
      });

      const response = await loader({
        request: buildRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.shopDomain).toBe("my-shop.myshopify.com");
    });
  });
});
