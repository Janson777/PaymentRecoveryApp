import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const MockPrismaClient = vi.fn().mockImplementation(() => ({
  _mockClient: true,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: MockPrismaClient,
}));

const savedNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = savedNodeEnv;
  delete (global as Record<string, unknown>).__prisma;
});

describe("db.server", () => {
  beforeEach(() => {
    vi.resetModules();
    MockPrismaClient.mockClear();
    delete (global as Record<string, unknown>).__prisma;
  });

  it("creates a new PrismaClient in production", async () => {
    process.env.NODE_ENV = "production";

    const { prisma } = await import("./db.server");

    expect(MockPrismaClient).toHaveBeenCalledTimes(1);
    expect(prisma).toBeDefined();
  });

  it("does not use global cache in production", async () => {
    process.env.NODE_ENV = "production";
    const existingClient = { _existing: true };
    (global as Record<string, unknown>).__prisma = existingClient;

    const { prisma } = await import("./db.server");

    expect(prisma).not.toBe(existingClient);
    expect(MockPrismaClient).toHaveBeenCalledTimes(1);
  });

  it("creates and caches PrismaClient on global in development", async () => {
    process.env.NODE_ENV = "development";

    const { prisma } = await import("./db.server");

    expect(MockPrismaClient).toHaveBeenCalledTimes(1);
    expect(prisma).toBeDefined();
    expect((global as Record<string, unknown>).__prisma).toBe(prisma);
  });

  it("reuses existing global PrismaClient in development", async () => {
    process.env.NODE_ENV = "development";
    const existingClient = { _reused: true };
    (global as Record<string, unknown>).__prisma = existingClient;

    const { prisma } = await import("./db.server");

    expect(MockPrismaClient).not.toHaveBeenCalled();
    expect(prisma).toBe(existingClient);
  });

  it("exports prisma as a named export", async () => {
    process.env.NODE_ENV = "development";

    const mod = await import("./db.server");

    expect(mod).toHaveProperty("prisma");
  });
});
