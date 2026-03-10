import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetShopifyOAuthUrl = vi.fn();
const mockIsValidShopDomain = vi.fn();
const mockSanitizeShopDomain = vi.fn();
const mockGetSession = vi.fn();
const mockCommitSession = vi.fn();

vi.mock("~/services/shopify-api.server", () => ({
  getShopifyOAuthUrl: (...args: unknown[]) => mockGetShopifyOAuthUrl(...args),
}));

vi.mock("~/lib/shopify.server", () => ({
  isValidShopDomain: (...args: unknown[]) => mockIsValidShopDomain(...args),
  sanitizeShopDomain: (...args: unknown[]) => mockSanitizeShopDomain(...args),
}));

vi.mock("~/lib/session.server", () => ({
  sessionStorage: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    commitSession: (...args: unknown[]) => mockCommitSession(...args),
  },
}));

import { loader } from "~/routes/auth.shopify";

function buildRequest(shop?: string): Request {
  const url = new URL("http://localhost:3000/auth/shopify");
  if (shop) url.searchParams.set("shop", shop);
  return new Request(url.toString());
}

describe("auth.shopify", () => {
  const mockSessionSet = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockSanitizeShopDomain.mockImplementation((s: string) =>
      s.trim().toLowerCase()
    );
    mockIsValidShopDomain.mockReturnValue(true);
    mockGetShopifyOAuthUrl.mockReturnValue(
      "https://store.myshopify.com/admin/oauth/authorize?client_id=key&scope=read_orders"
    );
    mockGetSession.mockResolvedValue({ set: mockSessionSet });
    mockCommitSession.mockResolvedValue("session-cookie=abc");
  });

  describe("loader", () => {
    it("throws 400 when shop parameter is missing", async () => {
      try {
        await loader({ request: buildRequest(), params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("throws 400 when shop domain is invalid", async () => {
      mockIsValidShopDomain.mockReturnValue(false);

      try {
        await loader({
          request: buildRequest("invalid-domain"),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("sanitizes shop domain before validation", async () => {
      mockSanitizeShopDomain.mockReturnValue("clean-store.myshopify.com");
      await loader({
        request: buildRequest("  CLEAN-STORE.myshopify.com  "),
        params: {},
        context: {},
      });

      expect(mockSanitizeShopDomain).toHaveBeenCalledWith(
        "  CLEAN-STORE.myshopify.com  "
      );
      expect(mockIsValidShopDomain).toHaveBeenCalledWith(
        "clean-store.myshopify.com"
      );
    });

    it("stores nonce and shop in session", async () => {
      mockSanitizeShopDomain.mockReturnValue("test-store.myshopify.com");
      await loader({
        request: buildRequest("test-store.myshopify.com"),
        params: {},
        context: {},
      });

      expect(mockSessionSet).toHaveBeenCalledWith(
        "oauthNonce",
        expect.any(String)
      );
      expect(mockSessionSet).toHaveBeenCalledWith(
        "oauthShop",
        "test-store.myshopify.com"
      );
    });

    it("calls getShopifyOAuthUrl with shop and nonce", async () => {
      mockSanitizeShopDomain.mockReturnValue("store.myshopify.com");
      await loader({
        request: buildRequest("store.myshopify.com"),
        params: {},
        context: {},
      });

      expect(mockGetShopifyOAuthUrl).toHaveBeenCalledWith(
        "store.myshopify.com",
        expect.any(String)
      );
    });

    it("redirects to OAuth URL", async () => {
      const oauthUrl =
        "https://store.myshopify.com/admin/oauth/authorize?client_id=key";
      mockGetShopifyOAuthUrl.mockReturnValue(oauthUrl);
      mockSanitizeShopDomain.mockReturnValue("store.myshopify.com");

      const response = await loader({
        request: buildRequest("store.myshopify.com"),
        params: {},
        context: {},
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(oauthUrl);
    });

    it("sets session cookie on redirect", async () => {
      mockCommitSession.mockResolvedValue("session=xyz123");
      mockSanitizeShopDomain.mockReturnValue("store.myshopify.com");

      const response = await loader({
        request: buildRequest("store.myshopify.com"),
        params: {},
        context: {},
      });

      expect(response.headers.get("Set-Cookie")).toBe("session=xyz123");
    });

    it("reads existing session from cookie header", async () => {
      mockSanitizeShopDomain.mockReturnValue("store.myshopify.com");
      const request = new Request(
        "http://localhost:3000/auth/shopify?shop=store.myshopify.com",
        { headers: { Cookie: "existing-session=abc" } }
      );

      await loader({ request, params: {}, context: {} });

      expect(mockGetSession).toHaveBeenCalledWith("existing-session=abc");
    });
  });
});
