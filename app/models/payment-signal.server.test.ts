import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignalType } from "@prisma/client";

const mockCreate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    paymentSignal: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  createPaymentSignal,
  getSignalsForCheckout,
  getSignalsForOrder,
} from "~/models/payment-signal.server";

describe("createPaymentSignal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates signal with all fields mapped correctly", async () => {
    const occurredAt = new Date("2026-03-10T12:00:00Z");
    const created = { id: 1, signalType: SignalType.TRANSACTION_FAILURE };
    mockCreate.mockResolvedValue(created);

    const result = await createPaymentSignal({
      shopId: 10,
      checkoutId: 100,
      shopifyOrderGid: "gid://shopify/Order/500",
      shopifyTransactionGid: "gid://shopify/OrderTransaction/200",
      signalType: SignalType.TRANSACTION_FAILURE,
      gateway: "stripe",
      transactionKind: "sale",
      transactionStatus: "FAILURE",
      errorCode: "card_declined",
      paymentMethodSummary: "Visa ending in 4242",
      amount: 99.99,
      currency: "USD",
      occurredAt,
      rawSourceTopic: "order_transactions/create",
      rawSourceEventId: "evt-001",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        shopId: 10,
        checkoutId: 100,
        shopifyOrderGid: "gid://shopify/Order/500",
        shopifyTransactionGid: "gid://shopify/OrderTransaction/200",
        signalType: SignalType.TRANSACTION_FAILURE,
        gateway: "stripe",
        transactionKind: "sale",
        transactionStatus: "FAILURE",
        errorCode: "card_declined",
        paymentMethodSummary: "Visa ending in 4242",
        amount: 99.99,
        currency: "USD",
        occurredAt,
        rawSourceTopic: "order_transactions/create",
        rawSourceEventId: "evt-001",
      },
    });
    expect(result).toEqual(created);
  });

  it("passes undefined for optional fields when not provided", async () => {
    const occurredAt = new Date();
    mockCreate.mockResolvedValue({ id: 2 });

    await createPaymentSignal({
      shopId: 5,
      signalType: SignalType.ORDER_CREATED,
      occurredAt,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        shopId: 5,
        checkoutId: undefined,
        shopifyOrderGid: undefined,
        shopifyTransactionGid: undefined,
        signalType: SignalType.ORDER_CREATED,
        gateway: undefined,
        transactionKind: undefined,
        transactionStatus: undefined,
        errorCode: undefined,
        paymentMethodSummary: undefined,
        amount: undefined,
        currency: undefined,
        occurredAt,
        rawSourceTopic: undefined,
        rawSourceEventId: undefined,
      },
    });
  });

  it("handles all signal types", async () => {
    const occurredAt = new Date();

    for (const signalType of [
      SignalType.TRANSACTION_FAILURE,
      SignalType.TRANSACTION_ERROR,
      SignalType.TRANSACTION_SUCCESS,
      SignalType.ORDER_CREATED,
      SignalType.ORDER_PAID,
      SignalType.ORDER_CANCELLED,
    ]) {
      vi.resetAllMocks();
      mockCreate.mockResolvedValue({ id: 1, signalType });

      await createPaymentSignal({
        shopId: 10,
        signalType,
        occurredAt,
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ signalType }),
      });
    }
  });
});

describe("getSignalsForCheckout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns signals ordered by occurredAt desc", async () => {
    const signals = [
      { id: 1, checkoutId: 100, occurredAt: new Date("2026-03-10T14:00:00Z") },
      { id: 2, checkoutId: 100, occurredAt: new Date("2026-03-10T12:00:00Z") },
    ];
    mockFindMany.mockResolvedValue(signals);

    const result = await getSignalsForCheckout(100);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { checkoutId: 100 },
      orderBy: { occurredAt: "desc" },
    });
    expect(result).toEqual(signals);
  });

  it("returns empty array when no signals found", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getSignalsForCheckout(999);

    expect(result).toEqual([]);
  });
});

describe("getSignalsForOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns signals ordered by occurredAt desc", async () => {
    const signals = [
      { id: 3, shopifyOrderGid: "gid://shopify/Order/500" },
      { id: 4, shopifyOrderGid: "gid://shopify/Order/500" },
    ];
    mockFindMany.mockResolvedValue(signals);

    const result = await getSignalsForOrder("gid://shopify/Order/500");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { shopifyOrderGid: "gid://shopify/Order/500" },
      orderBy: { occurredAt: "desc" },
    });
    expect(result).toEqual(signals);
  });

  it("returns empty array when no signals found", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getSignalsForOrder("gid://shopify/Order/missing");

    expect(result).toEqual([]);
  });
});
