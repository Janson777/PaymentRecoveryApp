import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutStatus } from "@prisma/client";

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    checkout: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  upsertCheckout,
  markCheckoutAbandoned,
  markCheckoutRecovered,
  findCheckoutByShopifyId,
  getActiveCheckouts,
} from "~/models/checkout.server";

describe("upsertCheckout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates existing checkout when shopifyCheckoutId matches", async () => {
    const existing = {
      id: 42,
      shopId: 1,
      shopifyCheckoutId: "chk_abc",
      email: "old@example.com",
      phone: null,
      customerId: null,
      currency: "USD",
      subtotalAmount: 100,
      totalAmount: 110,
      lineItemsHash: null,
    };
    mockFindFirst.mockResolvedValue(existing);
    const updated = { ...existing, email: "new@example.com" };
    mockUpdate.mockResolvedValue(updated);

    const result = await upsertCheckout({
      shopId: 1,
      shopifyCheckoutId: "chk_abc",
      email: "new@example.com",
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { shopId: 1, shopifyCheckoutId: "chk_abc" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        email: "new@example.com",
        phone: null,
        customerId: null,
        currency: "USD",
        subtotalAmount: 100,
        totalAmount: 110,
        lineItemsHash: null,
        lastSeenAt: expect.any(Date),
      }),
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it("preserves existing fields when new values are undefined", async () => {
    const existing = {
      id: 43,
      shopId: 1,
      shopifyCheckoutId: "chk_def",
      email: "keep@example.com",
      phone: "+15551234567",
      customerId: "cust_1",
      currency: "CAD",
      subtotalAmount: 50,
      totalAmount: 55,
      lineItemsHash: "hash123",
    };
    mockFindFirst.mockResolvedValue(existing);
    mockUpdate.mockResolvedValue(existing);

    await upsertCheckout({
      shopId: 1,
      shopifyCheckoutId: "chk_def",
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 43 },
      data: expect.objectContaining({
        email: "keep@example.com",
        phone: "+15551234567",
        customerId: "cust_1",
        currency: "CAD",
        subtotalAmount: 50,
        totalAmount: 55,
        lineItemsHash: "hash123",
      }),
    });
  });

  it("creates new checkout when no existing found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const created = { id: 44, shopId: 1, shopifyCheckoutId: "chk_new" };
    mockCreate.mockResolvedValue(created);

    const result = await upsertCheckout({
      shopId: 1,
      shopifyCheckoutId: "chk_new",
      email: "new@example.com",
      phone: "+15559999999",
      customerId: "cust_2",
      currency: "USD",
      subtotalAmount: 200,
      totalAmount: 220,
      lineItemsHash: "hash456",
      checkoutToken: "tok_new",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        shopId: 1,
        shopifyCheckoutId: "chk_new",
        checkoutToken: "tok_new",
        email: "new@example.com",
        phone: "+15559999999",
        customerId: "cust_2",
        currency: "USD",
        subtotalAmount: 200,
        totalAmount: 220,
        lineItemsHash: "hash456",
        startedAt: expect.any(Date),
        lastSeenAt: expect.any(Date),
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it("skips findFirst and creates directly when shopifyCheckoutId is missing", async () => {
    const created = { id: 45, shopId: 1 };
    mockCreate.mockResolvedValue(created);

    await upsertCheckout({
      shopId: 1,
      email: "noid@example.com",
    });

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 1,
        shopifyCheckoutId: undefined,
        email: "noid@example.com",
      }),
    });
  });

  it("sets startedAt and lastSeenAt to the same time on create", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 46 });

    const before = new Date();
    await upsertCheckout({ shopId: 1, shopifyCheckoutId: "chk_time" });
    const after = new Date();

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(createCall.data.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(createCall.data.startedAt).toEqual(createCall.data.lastSeenAt);
  });
});

describe("markCheckoutAbandoned", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets ABANDONED status, abandonedAt, and recoveryUrl", async () => {
    const abandoned = { id: 50, checkoutStatus: CheckoutStatus.ABANDONED };
    mockUpdate.mockResolvedValue(abandoned);

    const before = new Date();
    const result = await markCheckoutAbandoned(50, "https://shop.com/recover/abc");
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 50 },
      data: {
        checkoutStatus: CheckoutStatus.ABANDONED,
        abandonedAt: expect.any(Date),
        recoveryUrl: "https://shop.com/recover/abc",
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.abandonedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.abandonedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(abandoned);
  });
});

describe("markCheckoutRecovered", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets RECOVERED status and recoveredAt", async () => {
    const recovered = { id: 51, checkoutStatus: CheckoutStatus.RECOVERED };
    mockUpdate.mockResolvedValue(recovered);

    const before = new Date();
    const result = await markCheckoutRecovered(51);
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 51 },
      data: {
        checkoutStatus: CheckoutStatus.RECOVERED,
        recoveredAt: expect.any(Date),
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.recoveredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.recoveredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(recovered);
  });
});

describe("findCheckoutByShopifyId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns checkout when found", async () => {
    const checkout = { id: 60, shopId: 1, shopifyCheckoutId: "chk_found" };
    mockFindFirst.mockResolvedValue(checkout);

    const result = await findCheckoutByShopifyId(1, "chk_found");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { shopId: 1, shopifyCheckoutId: "chk_found" },
    });
    expect(result).toEqual(checkout);
  });

  it("returns null when not found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findCheckoutByShopifyId(1, "chk_missing");

    expect(result).toBeNull();
  });
});

describe("getActiveCheckouts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ACTIVE checkouts ordered by lastSeenAt desc", async () => {
    const checkouts = [
      { id: 70, shopId: 1, checkoutStatus: CheckoutStatus.ACTIVE },
      { id: 71, shopId: 1, checkoutStatus: CheckoutStatus.ACTIVE },
    ];
    mockFindMany.mockResolvedValue(checkouts);

    const result = await getActiveCheckouts(1);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        shopId: 1,
        checkoutStatus: CheckoutStatus.ACTIVE,
      },
      orderBy: { lastSeenAt: "desc" },
    });
    expect(result).toEqual(checkouts);
  });

  it("returns empty array when no active checkouts", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getActiveCheckouts(99);

    expect(result).toEqual([]);
  });
});
