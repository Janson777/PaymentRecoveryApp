import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    ordersIndex: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import {
  upsertOrder,
  markOrderPaid,
  markOrderCancelled,
  findOrderByGid,
  findRecentOrderByEmail,
  attributeRecovery,
} from "~/models/order.server";

describe("upsertOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts with all fields mapped correctly", async () => {
    const order = { id: 1, shopifyOrderGid: "gid://shopify/Order/123" };
    mockUpsert.mockResolvedValue(order);

    const result = await upsertOrder({
      shopId: 10,
      shopifyOrderGid: "gid://shopify/Order/123",
      orderName: "#1001",
      email: "buyer@example.com",
      customerId: "cust_100",
      financialStatus: "paid",
      gatewayNames: ["stripe", "gift_card"],
    });

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/123" },
      create: {
        shopId: 10,
        shopifyOrderGid: "gid://shopify/Order/123",
        orderName: "#1001",
        email: "buyer@example.com",
        customerId: "cust_100",
        financialStatus: "paid",
        gatewayNamesJson: ["stripe", "gift_card"],
      },
      update: {
        financialStatus: "paid",
        email: "buyer@example.com",
        gatewayNamesJson: ["stripe", "gift_card"],
      },
    });
    expect(result).toEqual(order);
  });

  it("defaults gatewayNamesJson to empty array on create when missing", async () => {
    mockUpsert.mockResolvedValue({ id: 2 });

    await upsertOrder({
      shopId: 10,
      shopifyOrderGid: "gid://shopify/Order/456",
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          gatewayNamesJson: [],
        }),
        update: expect.objectContaining({
          gatewayNamesJson: undefined,
        }),
      })
    );
  });

  it("passes undefined for optional create fields when not provided", async () => {
    mockUpsert.mockResolvedValue({ id: 3 });

    await upsertOrder({
      shopId: 5,
      shopifyOrderGid: "gid://shopify/Order/789",
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          orderName: undefined,
          email: undefined,
          customerId: undefined,
          financialStatus: undefined,
        }),
      })
    );
  });
});

describe("markOrderPaid", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates paidAt for the given GID", async () => {
    const updated = { id: 1, paidAt: new Date() };
    mockUpdate.mockResolvedValue(updated);

    const before = new Date();
    const result = await markOrderPaid("gid://shopify/Order/100");
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/100" },
      data: { paidAt: expect.any(Date) },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.paidAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.paidAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(updated);
  });
});

describe("markOrderCancelled", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates cancelledAt for the given GID", async () => {
    const updated = { id: 1, cancelledAt: new Date() };
    mockUpdate.mockResolvedValue(updated);

    const before = new Date();
    const result = await markOrderCancelled("gid://shopify/Order/200");
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/200" },
      data: { cancelledAt: expect.any(Date) },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.cancelledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.cancelledAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(updated);
  });
});

describe("findOrderByGid", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns order when found", async () => {
    const order = { id: 10, shopifyOrderGid: "gid://shopify/Order/300" };
    mockFindUnique.mockResolvedValue(order);

    const result = await findOrderByGid("gid://shopify/Order/300");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/300" },
    });
    expect(result).toEqual(order);
  });

  it("returns null when not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await findOrderByGid("gid://shopify/Order/missing");

    expect(result).toBeNull();
  });
});

describe("findRecentOrderByEmail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("queries with default 24-hour window", async () => {
    const order = { id: 20, email: "recent@example.com" };
    mockFindFirst.mockResolvedValue(order);

    const before = new Date();
    const result = await findRecentOrderByEmail(1, "recent@example.com");
    const after = new Date();

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        shopId: 1,
        email: "recent@example.com",
        createdAt: { gte: expect.any(Date) },
      },
      orderBy: { createdAt: "desc" },
    });
    const call = mockFindFirst.mock.calls[0][0];
    const sinceDate = call.where.createdAt.gte;
    const expectedMs = 24 * 3_600_000;
    expect(before.getTime() - sinceDate.getTime()).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(after.getTime() - sinceDate.getTime()).toBeLessThanOrEqual(expectedMs + 100);
    expect(result).toEqual(order);
  });

  it("respects custom sinceHours parameter", async () => {
    mockFindFirst.mockResolvedValue(null);

    const before = new Date();
    await findRecentOrderByEmail(2, "test@example.com", 48);
    const after = new Date();

    const call = mockFindFirst.mock.calls[0][0];
    const sinceDate = call.where.createdAt.gte;
    const expectedMs = 48 * 3_600_000;
    expect(before.getTime() - sinceDate.getTime()).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(after.getTime() - sinceDate.getTime()).toBeLessThanOrEqual(expectedMs + 100);
  });

  it("returns null when no recent order found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findRecentOrderByEmail(1, "nobody@example.com");

    expect(result).toBeNull();
  });
});

describe("attributeRecovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates the order with the attributed case ID", async () => {
    mockUpdate.mockResolvedValue({ id: 30 });

    await attributeRecovery("gid://shopify/Order/400", 99);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/400" },
      data: { checkoutRecoveryAttributedCaseId: 99 },
    });
  });
});
