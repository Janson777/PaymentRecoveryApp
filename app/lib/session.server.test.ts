import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSessionFn = vi.fn();

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-session-secret";
});

vi.mock("@remix-run/node", () => ({
  createCookieSessionStorage: vi.fn(() => ({
    getSession: (...args: unknown[]) => mockGetSessionFn(...args),
    commitSession: vi.fn(),
    destroySession: vi.fn(),
  })),
}));

import { createCookieSessionStorage } from "@remix-run/node";
import {
  sessionStorage,
  getSession,
  getShopId,
  requireShopId,
} from "./session.server";

describe("sessionStorage", () => {
  it("is created with correct cookie configuration", () => {
    expect(createCookieSessionStorage).toHaveBeenCalledWith({
      cookie: {
        name: "__session",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secrets: ["test-session-secret"],
        secure: false,
        maxAge: 60 * 60 * 24 * 30,
      },
    });
  });

  it("exports sessionStorage object", () => {
    expect(sessionStorage).toBeDefined();
    expect(sessionStorage.getSession).toBeDefined();
  });
});

describe("getSession", () => {
  beforeEach(() => {
    mockGetSessionFn.mockClear();
  });

  it("extracts Cookie header from request and passes to storage", async () => {
    const mockSession = { get: vi.fn() };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard", {
      headers: { Cookie: "__session=abc123" },
    });

    const session = await getSession(request);

    expect(mockGetSessionFn).toHaveBeenCalledWith("__session=abc123");
    expect(session).toBe(mockSession);
  });

  it("passes null when no Cookie header is present", async () => {
    const mockSession = { get: vi.fn() };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");

    await getSession(request);

    expect(mockGetSessionFn).toHaveBeenCalledWith(null);
  });
});

describe("getShopId", () => {
  beforeEach(() => {
    mockGetSessionFn.mockClear();
  });

  it("returns shopId when session contains a number", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(42) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");
    const result = await getShopId(request);

    expect(mockSession.get).toHaveBeenCalledWith("shopId");
    expect(result).toBe(42);
  });

  it("returns null when session has no shopId", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(undefined) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");
    const result = await getShopId(request);

    expect(result).toBeNull();
  });

  it("returns null when shopId is a string (not a number)", async () => {
    const mockSession = { get: vi.fn().mockReturnValue("not-a-number") };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");
    const result = await getShopId(request);

    expect(result).toBeNull();
  });

  it("returns null when shopId is null", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(null) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");
    const result = await getShopId(request);

    expect(result).toBeNull();
  });
});

describe("requireShopId", () => {
  beforeEach(() => {
    mockGetSessionFn.mockClear();
  });

  it("returns shopId when session contains a valid number", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(99) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");
    const result = await requireShopId(request);

    expect(result).toBe(99);
  });

  it("throws 401 Response when shopId is missing", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(undefined) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");

    try {
      await requireShopId(request);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Unauthorized");
    }
  });

  it("throws 401 Response when shopId is a string", async () => {
    const mockSession = { get: vi.fn().mockReturnValue("string-id") };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");

    try {
      await requireShopId(request);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(401);
    }
  });

  it("throws 401 Response when shopId is null", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(null) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");

    try {
      await requireShopId(request);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(401);
    }
  });

  it("throws 401 Response when shopId is 0 (falsy number)", async () => {
    const mockSession = { get: vi.fn().mockReturnValue(0) };
    mockGetSessionFn.mockResolvedValue(mockSession);

    const request = new Request("http://localhost:3000/dashboard");

    try {
      await requireShopId(request);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(401);
    }
  });
});
