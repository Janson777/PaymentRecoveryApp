import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockExchangeCodeForToken = vi.fn();
const mockRegisterWebhooks = vi.fn();
const mockUpsertShop = vi.fn();
const mockIsValidShopDomain = vi.fn();
const mockSanitizeShopDomain = vi.fn();
const mockVerifyOAuthHmac = vi.fn();
const mockGetSession = vi.fn();
const mockCommitSession = vi.fn();

vi.mock("~/services/shopify-api.server", () => ({
  exchangeCodeForToken: (...args: unknown[]) =>
    mockExchangeCodeForToken(...args),
  registerWebhooks: (...args: unknown[]) => mockRegisterWebhooks(...args),
}));

vi.mock("~/models/shop.server", () => ({
  upsertShop: (...args: unknown[]) => mockUpsertShop(...args),
}));

vi.mock("~/lib/shopify.server", () => ({
  isValidShopDomain: (...args: unknown[]) => mockIsValidShopDomain(...args),
  sanitizeShopDomain: (...args: unknown[]) => mockSanitizeShopDomain(...args),
  verifyOAuthHmac: (...args: unknown[]) => mockVerifyOAuthHmac(...args),
}));

vi.mock("~/lib/session.server", () => ({
  sessionStorage: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    commitSession: (...args: unknown[]) => mockCommitSession(...args),
  },
}));

import { loader } from "~/routes/auth.callback";

const VALID_PARAMS: Record<string, string> = {
  shop: "store.myshopify.com",
  code: "auth-code-123",
  state: "nonce-abc",
  hmac: "valid-hmac-signature",
};

function buildRequest(
  params: Record<string, string> = VALID_PARAMS,
  cookie?: string
): Request {
  const url = new URL("http://localhost:3000/auth/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  return new Request(url.toString(), { headers });
}

const savedEnv: Record<string, string | undefined> = {};

describe("auth.callback", () => {
  const mockSession = {
    get: vi.fn(),
    set: vi.fn(),
    unset: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    savedEnv.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
    process.env.SHOPIFY_API_SECRET = "test-api-secret";

    mockSanitizeShopDomain.mockImplementation((s: string) =>
      s.trim().toLowerCase()
    );
    mockIsValidShopDomain.mockReturnValue(true);
    mockVerifyOAuthHmac.mockReturnValue(true);
    mockGetSession.mockResolvedValue(mockSession);
    mockCommitSession.mockResolvedValue("session-cookie=xyz");
    mockSession.get.mockImplementation((key: string) => {
      if (key === "oauthNonce") return "nonce-abc";
      if (key === "oauthShop") return "store.myshopify.com";
      return undefined;
    });
    mockExchangeCodeForToken.mockResolvedValue("shpat_test_token");
    mockUpsertShop.mockResolvedValue({
      id: 10,
      shopDomain: "store.myshopify.com",
    });
    mockRegisterWebhooks.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (savedEnv.SHOPIFY_API_SECRET === undefined) {
      delete process.env.SHOPIFY_API_SECRET;
    } else {
      process.env.SHOPIFY_API_SECRET = savedEnv.SHOPIFY_API_SECRET;
    }
  });

  describe("parameter validation", () => {
    it("throws 400 when shop is missing", async () => {
      const { shop: _, ...params } = VALID_PARAMS;
      try {
        await loader({ request: buildRequest(params), params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("throws 400 when code is missing", async () => {
      const { code: _, ...params } = VALID_PARAMS;
      try {
        await loader({ request: buildRequest(params), params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("throws 400 when state is missing", async () => {
      const { state: _, ...params } = VALID_PARAMS;
      try {
        await loader({ request: buildRequest(params), params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("throws 400 when hmac is missing", async () => {
      const { hmac: _, ...params } = VALID_PARAMS;
      try {
        await loader({ request: buildRequest(params), params: {}, context: {} });
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
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(400);
      }
    });

    it("sanitizes shop domain", async () => {
      mockSanitizeShopDomain.mockReturnValue("store.myshopify.com");
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockSanitizeShopDomain).toHaveBeenCalledWith(
        "store.myshopify.com"
      );
    });
  });

  describe("HMAC verification", () => {
    it("throws 500 when SHOPIFY_API_SECRET is not set", async () => {
      delete process.env.SHOPIFY_API_SECRET;
      try {
        await loader({
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(500);
      }
    });

    it("throws 403 when HMAC is invalid", async () => {
      mockVerifyOAuthHmac.mockReturnValue(false);
      try {
        await loader({
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(403);
      }
    });

    it("passes URL params and secret to verifyOAuthHmac", async () => {
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockVerifyOAuthHmac).toHaveBeenCalledWith(
        expect.any(URLSearchParams),
        "test-api-secret"
      );
    });
  });

  describe("session nonce validation", () => {
    it("throws 403 when stored nonce is missing", async () => {
      mockSession.get.mockReturnValue(undefined);
      try {
        await loader({
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(403);
      }
    });

    it("throws 403 when state does not match stored nonce", async () => {
      mockSession.get.mockImplementation((key: string) => {
        if (key === "oauthNonce") return "different-nonce";
        if (key === "oauthShop") return "store.myshopify.com";
        return undefined;
      });
      try {
        await loader({
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(403);
      }
    });

    it("throws 403 when stored shop does not match", async () => {
      mockSession.get.mockImplementation((key: string) => {
        if (key === "oauthNonce") return "nonce-abc";
        if (key === "oauthShop") return "other-store.myshopify.com";
        return undefined;
      });
      try {
        await loader({
          request: buildRequest(VALID_PARAMS),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(403);
      }
    });

    it("passes when stored shop is null (no stored shop)", async () => {
      mockSession.get.mockImplementation((key: string) => {
        if (key === "oauthNonce") return "nonce-abc";
        if (key === "oauthShop") return null;
        return undefined;
      });

      const response = await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(response.status).toBe(302);
    });
  });

  describe("success flow", () => {
    it("exchanges code for access token", async () => {
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockExchangeCodeForToken).toHaveBeenCalledWith(
        "store.myshopify.com",
        "auth-code-123"
      );
    });

    it("upserts shop with access token", async () => {
      mockExchangeCodeForToken.mockResolvedValue("shpat_new_token");
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockUpsertShop).toHaveBeenCalledWith({
        shopDomain: "store.myshopify.com",
        accessToken: "shpat_new_token",
        apiVersion: "2024-10",
      });
    });

    it("registers webhooks with shop and token", async () => {
      mockExchangeCodeForToken.mockResolvedValue("shpat_token");
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockRegisterWebhooks).toHaveBeenCalledWith(
        "store.myshopify.com",
        "shpat_token"
      );
    });

    it("sets shopId and shopDomain in session", async () => {
      mockUpsertShop.mockResolvedValue({
        id: 42,
        shopDomain: "store.myshopify.com",
      });
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockSession.set).toHaveBeenCalledWith("shopId", 42);
      expect(mockSession.set).toHaveBeenCalledWith(
        "shopDomain",
        "store.myshopify.com"
      );
    });

    it("clears oauth nonce and shop from session", async () => {
      await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(mockSession.unset).toHaveBeenCalledWith("oauthNonce");
      expect(mockSession.unset).toHaveBeenCalledWith("oauthShop");
    });

    it("redirects to /dashboard with session cookie", async () => {
      mockCommitSession.mockResolvedValue("new-session-cookie=abc");
      const response = await loader({
        request: buildRequest(VALID_PARAMS),
        params: {},
        context: {},
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard");
      expect(response.headers.get("Set-Cookie")).toBe(
        "new-session-cookie=abc"
      );
    });
  });
});
