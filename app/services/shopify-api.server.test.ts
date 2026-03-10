import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import type { Shop } from "@prisma/client";

const mockGetAccessToken = vi.fn();

vi.mock("~/models/shop.server", () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getShopifyOAuthUrl,
  registerWebhooks,
  exchangeCodeForToken,
  shopifyGraphQL,
  QUERIES,
} from "./shopify-api.server";

const savedEnv: Record<string, string | undefined> = {};

function saveEnv(...keys: string[]) {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeAll(() => {
  saveEnv("SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "APP_URL");
});

afterAll(() => {
  restoreEnv();
});

describe("getShopifyOAuthUrl", () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = "test-api-key";
    process.env.APP_URL = "https://myapp.example.com";
  });

  it("builds correct OAuth URL with all parameters", () => {
    const url = getShopifyOAuthUrl("test-store.myshopify.com", "nonce123");

    expect(url).toContain("https://test-store.myshopify.com/admin/oauth/authorize");
    expect(url).toContain("client_id=test-api-key");
    expect(url).toContain("scope=read_orders");
    expect(url).toContain("state=nonce123");
  });

  it("encodes the redirect_uri", () => {
    const url = getShopifyOAuthUrl("shop.myshopify.com", "abc");

    expect(url).toContain(
      `redirect_uri=${encodeURIComponent("https://myapp.example.com/auth/callback")}`
    );
  });

  it("uses SHOPIFY_API_KEY env var", () => {
    process.env.SHOPIFY_API_KEY = "custom-key-xyz";

    const url = getShopifyOAuthUrl("shop.myshopify.com", "n");

    expect(url).toContain("client_id=custom-key-xyz");
  });

  it("uses APP_URL env var for redirect", () => {
    process.env.APP_URL = "https://other-app.example.com";

    const url = getShopifyOAuthUrl("shop.myshopify.com", "n");

    expect(url).toContain(
      encodeURIComponent("https://other-app.example.com/auth/callback")
    );
  });
});

describe("registerWebhooks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = "https://myapp.example.com";
  });

  function mockFetchOk() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: () => Promise.resolve(""),
    });
  }

  it("calls fetch for all 5 webhook topics", async () => {
    mockFetchOk();

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("uses correct URL format with API version", async () => {
    mockFetchOk();

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(
      "https://shop.myshopify.com/admin/api/2024-10/webhooks.json"
    );
  });

  it("sends correct headers with access token", async () => {
    mockFetchOk();

    await registerWebhooks("shop.myshopify.com", "shpat_abc123");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": "shpat_abc123",
    });
  });

  it("sends correct body with topic, address, and format", async () => {
    mockFetchOk();

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    const firstCall = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(firstCall.body as string);
    expect(body).toEqual({
      webhook: {
        topic: "orders/create",
        address: "https://myapp.example.com/webhooks/shopify",
        format: "json",
      },
    });
  });

  it("registers all expected topics", async () => {
    mockFetchOk();

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    const topics = mockFetch.mock.calls.map((call) => {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      return body.webhook.topic;
    });
    expect(topics).toEqual([
      "orders/create",
      "orders/updated",
      "checkouts/create",
      "checkouts/update",
      "app/uninstalled",
    ]);
  });

  it("logs registered count on success", async () => {
    mockFetchOk();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    expect(logSpy).toHaveBeenCalledWith(
      "Registered 5/5 webhooks for shop.myshopify.com"
    );
    logSpy.mockRestore();
  });

  it("logs errors for failed registrations and counts only successes", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ ok: false, status: 422, text: () => Promise.resolve("Already exists") })
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("Server error") });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to register webhook")
    );
    expect(logSpy).toHaveBeenCalledWith(
      "Registered 3/5 webhooks for shop.myshopify.com"
    );
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("handles fetch rejection gracefully via Promise.allSettled", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") })
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") })
      .mockResolvedValueOnce({ ok: true, status: 201, text: () => Promise.resolve("") });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await registerWebhooks("shop.myshopify.com", "shpat_token");

    expect(logSpy).toHaveBeenCalledWith(
      "Registered 4/5 webhooks for shop.myshopify.com"
    );
    logSpy.mockRestore();
  });
});

describe("exchangeCodeForToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SHOPIFY_API_KEY = "test-api-key";
    process.env.SHOPIFY_API_SECRET = "test-api-secret";
  });

  it("sends correct POST body with client credentials and code", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "shpat_new" }),
    });

    await exchangeCodeForToken("shop.myshopify.com", "auth_code_123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://shop.myshopify.com/admin/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "test-api-key",
          client_secret: "test-api-secret",
          code: "auth_code_123",
        }),
      }
    );
  });

  it("returns access_token from successful response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "shpat_returned_token" }),
    });

    const token = await exchangeCodeForToken("shop.myshopify.com", "code");

    expect(token).toBe("shpat_returned_token");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
    });

    await expect(
      exchangeCodeForToken("shop.myshopify.com", "bad_code")
    ).rejects.toThrow("Shopify OAuth failed: 400");
  });
});

describe("shopifyGraphQL", () => {
  const mockShop = {
    id: 1,
    shopDomain: "test-store.myshopify.com",
    accessTokenEncrypted: "encrypted",
  } as Shop;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAccessToken.mockReturnValue("shpat_decrypted");
  });

  it("sends correct POST with query and variables", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { orders: [] } }),
    });

    await shopifyGraphQL(mockShop, "query { orders { id } }", { first: 10 });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-store.myshopify.com/admin/api/2024-10/graphql.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "shpat_decrypted",
        },
        body: JSON.stringify({
          query: "query { orders { id } }",
          variables: { first: 10 },
        }),
      }
    );
  });

  it("uses getAccessToken to get the auth token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await shopifyGraphQL(mockShop, "query { shop { name } }");

    expect(mockGetAccessToken).toHaveBeenCalledWith(mockShop);
  });

  it("returns data from response", async () => {
    const responseData = {
      abandonedCheckouts: { edges: [], pageInfo: { hasNextPage: false } },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: responseData }),
    });

    const result = await shopifyGraphQL(mockShop, "query { }");

    expect(result).toEqual(responseData);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      shopifyGraphQL(mockShop, "query { }")
    ).rejects.toThrow("Shopify GraphQL error: 401");
  });

  it("logs GraphQL errors but still returns data", async () => {
    const errors = [{ message: "Field not found" }];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { shop: null }, errors }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await shopifyGraphQL(mockShop, "query { shop { name } }");

    expect(errorSpy).toHaveBeenCalledWith("Shopify GraphQL errors:", errors);
    expect(result).toEqual({ shop: null });
    errorSpy.mockRestore();
  });

  it("does not log when errors array is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {}, errors: [] }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await shopifyGraphQL(mockShop, "query { }");

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("works without variables parameter", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { shop: { name: "Test" } } }),
    });

    await shopifyGraphQL(mockShop, "query { shop { name } }");

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({
      query: "query { shop { name } }",
      variables: undefined,
    });
  });
});

describe("QUERIES", () => {
  it("exports abandonedCheckouts query string", () => {
    expect(QUERIES.abandonedCheckouts).toContain("abandonedCheckouts");
    expect(QUERIES.abandonedCheckouts).toContain("$first: Int!");
    expect(QUERIES.abandonedCheckouts).toContain("completedAt");
    expect(QUERIES.abandonedCheckouts).toContain("abandonedCheckoutUrl");
  });

  it("exports orderWithTransactions query string", () => {
    expect(QUERIES.orderWithTransactions).toContain("order(id: $id)");
    expect(QUERIES.orderWithTransactions).toContain("transactions");
    expect(QUERIES.orderWithTransactions).toContain("displayFinancialStatus");
  });
});
