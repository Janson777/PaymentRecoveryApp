import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockFindMany = vi.fn();
const mockGetSession = vi.fn();
const mockCommitSession = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    shop: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("~/lib/session.server", () => ({
  sessionStorage: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    commitSession: (...args: unknown[]) => mockCommitSession(...args),
  },
}));

import { loader, action } from "~/routes/dev.login";

function buildGetRequest(): Request {
  return new Request("http://localhost:3000/dev/login");
}

function buildFormRequest(fields: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request("http://localhost:3000/dev/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

const savedNodeEnv = process.env.NODE_ENV;

describe("dev.login", () => {
  const mockSession = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NODE_ENV = "development";
    mockFindMany.mockResolvedValue([
      { id: 1, shopDomain: "store-one.myshopify.com" },
      { id: 2, shopDomain: "store-two.myshopify.com" },
    ]);
    mockGetSession.mockResolvedValue(mockSession);
    mockCommitSession.mockResolvedValue("dev-session=abc");
  });

  afterAll(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  describe("loader", () => {
    it("throws 404 in production", async () => {
      process.env.NODE_ENV = "production";

      try {
        await loader({
          request: buildGetRequest(),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("returns active shops", async () => {
      const response = await loader({
        request: buildGetRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.shops).toEqual([
        { id: 1, shopDomain: "store-one.myshopify.com" },
        { id: 2, shopDomain: "store-two.myshopify.com" },
      ]);
    });

    it("queries active shops ordered by ID", async () => {
      await loader({
        request: buildGetRequest(),
        params: {},
        context: {},
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true, shopDomain: true },
        orderBy: { id: "asc" },
      });
    });

    it("returns empty shops array when none exist", async () => {
      mockFindMany.mockResolvedValue([]);

      const response = await loader({
        request: buildGetRequest(),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(data.shops).toEqual([]);
    });
  });

  describe("action", () => {
    it("throws 404 in production", async () => {
      process.env.NODE_ENV = "production";

      try {
        await action({
          request: buildFormRequest({ shopId: "1" }),
          params: {},
          context: {},
        });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("returns 400 for invalid shopId", async () => {
      const response = await action({
        request: buildFormRequest({ shopId: "not-a-number" }),
        params: {},
        context: {},
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid shop ID");
    });

    it("treats missing shopId as 0 (Number(null) === 0)", async () => {
      const response = await action({
        request: buildFormRequest({}),
        params: {},
        context: {},
      });

      expect(mockSession.set).toHaveBeenCalledWith("shopId", 0);
      expect(response.status).toBe(302);
    });

    it("sets shopId in session and redirects to /dashboard", async () => {
      mockCommitSession.mockResolvedValue("session=new-cookie");

      const response = await action({
        request: buildFormRequest({ shopId: "42" }),
        params: {},
        context: {},
      });

      expect(mockSession.set).toHaveBeenCalledWith("shopId", 42);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/dashboard");
      expect(response.headers.get("Set-Cookie")).toBe("session=new-cookie");
    });

    it("commits session to cookie", async () => {
      await action({
        request: buildFormRequest({ shopId: "10" }),
        params: {},
        context: {},
      });

      expect(mockCommitSession).toHaveBeenCalledWith(mockSession);
    });
  });
});
