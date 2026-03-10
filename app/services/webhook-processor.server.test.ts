import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessingStatus, SignalType } from "@prisma/client";

const mockWebhookFindUnique = vi.fn();
const mockUpsertCheckout = vi.fn();
const mockCreatePaymentSignal = vi.fn();
const mockUpsertOrder = vi.fn();
const mockMarkOrderPaid = vi.fn();
const mockMarkOrderCancelled = vi.fn();
const mockMarkEventProcessed = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    webhookEvent: {
      findUnique: (...args: unknown[]) => mockWebhookFindUnique(...args),
    },
  },
}));

vi.mock("~/models/webhook-event.server", () => ({
  markEventProcessed: (...args: unknown[]) => mockMarkEventProcessed(...args),
}));

vi.mock("~/models/checkout.server", () => ({
  upsertCheckout: (...args: unknown[]) => mockUpsertCheckout(...args),
}));

vi.mock("~/models/payment-signal.server", () => ({
  createPaymentSignal: (...args: unknown[]) => mockCreatePaymentSignal(...args),
}));

vi.mock("~/models/order.server", () => ({
  upsertOrder: (...args: unknown[]) => mockUpsertOrder(...args),
  markOrderPaid: (...args: unknown[]) => mockMarkOrderPaid(...args),
  markOrderCancelled: (...args: unknown[]) => mockMarkOrderCancelled(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: vi.fn(),
}));

import { processWebhookEvent } from "./webhook-processor.server";

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    shopId: 10,
    topic: "checkouts/create",
    eventId: "evt-001",
    payloadJson: {},
    ...overrides,
  };
}

describe("processWebhookEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUpsertCheckout.mockResolvedValue(undefined);
    mockCreatePaymentSignal.mockResolvedValue(undefined);
    mockUpsertOrder.mockResolvedValue(undefined);
    mockMarkOrderPaid.mockResolvedValue(undefined);
    mockMarkOrderCancelled.mockResolvedValue(undefined);
    mockMarkEventProcessed.mockResolvedValue(undefined);
  });

  describe("event lookup and routing", () => {
    it("returns early when webhook event is not found", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockWebhookFindUnique.mockResolvedValue(null);

      await processWebhookEvent({
        webhookEventId: 999,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(errorSpy).toHaveBeenCalledWith("Webhook event 999 not found");
      expect(mockUpsertCheckout).not.toHaveBeenCalled();
      expect(mockMarkEventProcessed).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("routes checkouts/create to handleCheckoutCreate", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: { id: "chk_1", token: "tok_1", email: "a@b.com" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(mockUpsertCheckout).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("routes checkouts/update to handleCheckoutUpdate", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/update",
          payloadJson: { id: "chk_1", token: "tok_1" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/update",
      });

      expect(mockUpsertCheckout).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("routes order_transactions/create to handleOrderTransaction", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          payloadJson: { id: "txn_1", status: "failure", order_id: "123" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("routes orders/create to handleOrderCreate", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: { id: "456", name: "#1001" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      expect(mockUpsertOrder).toHaveBeenCalled();
      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("routes orders/paid to handleOrderPaid", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/paid",
          payloadJson: { id: "456" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/paid",
      });

      expect(mockMarkOrderPaid).toHaveBeenCalled();
      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("routes orders/cancelled to handleOrderCancelled", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/cancelled",
          payloadJson: { id: "456" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/cancelled",
      });

      expect(mockMarkOrderCancelled).toHaveBeenCalled();
      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("warns on unhandled webhook topic", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({ topic: "products/update", payloadJson: {} })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "products/update",
      });

      expect(warnSpy).toHaveBeenCalledWith(
        "Unhandled webhook topic: products/update"
      );
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
      warnSpy.mockRestore();
    });

    it("marks event as PROCESSED on success", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: { id: "chk_1" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("marks event as FAILED on error and re-throws", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("DB connection lost");
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: { id: "chk_1" },
        })
      );
      mockUpsertCheckout.mockRejectedValue(error);

      await expect(
        processWebhookEvent({
          webhookEventId: 1,
          shopId: 10,
          topic: "checkouts/create",
        })
      ).rejects.toThrow("DB connection lost");

      expect(errorSpy).toHaveBeenCalledWith(
        "Error processing webhook 1:",
        error
      );
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.FAILED
      );
      errorSpy.mockRestore();
    });
  });

  describe("handleCheckoutCreate", () => {
    it("maps all payload fields to upsertCheckout params", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: {
            id: "chk_abc",
            token: "tok_xyz",
            email: "customer@shop.com",
            phone: "+15559876543",
            customer_id: "cust_100",
            currency: "USD",
            total_price: "149.99",
            subtotal_price: "139.99",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(mockUpsertCheckout).toHaveBeenCalledWith({
        shopId: 10,
        shopifyCheckoutId: "chk_abc",
        checkoutToken: "tok_xyz",
        email: "customer@shop.com",
        phone: "+15559876543",
        customerId: "cust_100",
        currency: "USD",
        totalAmount: 149.99,
        subtotalAmount: 139.99,
      });
    });

    it("handles missing optional fields gracefully", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: { id: "chk_minimal" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(mockUpsertCheckout).toHaveBeenCalledWith({
        shopId: 10,
        shopifyCheckoutId: "chk_minimal",
        checkoutToken: undefined,
        email: undefined,
        phone: undefined,
        customerId: undefined,
        currency: undefined,
        totalAmount: undefined,
        subtotalAmount: undefined,
      });
    });

    it("converts total_price and subtotal_price to numbers", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "checkouts/create",
          payloadJson: {
            total_price: "0.01",
            subtotal_price: "0",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/create",
      });

      expect(mockUpsertCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 0.01,
          subtotalAmount: 0,
        })
      );
    });
  });

  describe("handleCheckoutUpdate", () => {
    it("maps payload fields identically to checkouts/create", async () => {
      const payload = {
        id: "chk_upd",
        token: "tok_upd",
        email: "updated@shop.com",
        phone: "+15551111111",
        customer_id: "cust_200",
        currency: "CAD",
        total_price: "250.00",
        subtotal_price: "230.00",
      };

      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({ topic: "checkouts/update", payloadJson: payload })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "checkouts/update",
      });

      expect(mockUpsertCheckout).toHaveBeenCalledWith({
        shopId: 10,
        shopifyCheckoutId: "chk_upd",
        checkoutToken: "tok_upd",
        email: "updated@shop.com",
        phone: "+15551111111",
        customerId: "cust_200",
        currency: "CAD",
        totalAmount: 250,
        subtotalAmount: 230,
      });
    });
  });

  describe("handleOrderTransaction", () => {
    it("creates TRANSACTION_FAILURE signal for failure status", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-1",
          payloadJson: {
            id: "txn_100",
            status: "failure",
            kind: "sale",
            error_code: "card_declined",
            gateway: "stripe",
            amount: "99.99",
            currency: "USD",
            order_id: "5001",
            processed_at: "2026-03-10T12:00:00Z",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith({
        shopId: 10,
        shopifyOrderGid: "gid://shopify/Order/5001",
        shopifyTransactionGid: "gid://shopify/OrderTransaction/txn_100",
        signalType: SignalType.TRANSACTION_FAILURE,
        gateway: "stripe",
        transactionKind: "sale",
        transactionStatus: "FAILURE",
        errorCode: "card_declined",
        amount: 99.99,
        currency: "USD",
        occurredAt: new Date("2026-03-10T12:00:00Z"),
        rawSourceTopic: "order_transactions/create",
        rawSourceEventId: "evt-txn-1",
      });
    });

    it("creates TRANSACTION_ERROR signal for error status", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-2",
          payloadJson: {
            id: "txn_101",
            status: "error",
            order_id: "5002",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signalType: SignalType.TRANSACTION_ERROR,
        })
      );
    });

    it("creates TRANSACTION_SUCCESS signal for success status", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-3",
          payloadJson: {
            id: "txn_102",
            status: "success",
            order_id: "5003",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signalType: SignalType.TRANSACTION_SUCCESS,
        })
      );
    });

    it("ignores transactions with unknown status", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-4",
          payloadJson: {
            id: "txn_103",
            status: "pending",
            order_id: "5004",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).not.toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });

    it("handles case-insensitive status (uppercase conversion)", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-5",
          payloadJson: {
            id: "txn_104",
            status: "Failure",
            order_id: "5005",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signalType: SignalType.TRANSACTION_FAILURE,
          transactionStatus: "FAILURE",
        })
      );
    });

    it("builds correct GID strings from payload IDs", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-6",
          payloadJson: {
            id: "txn_200",
            status: "failure",
            order_id: "7777",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          shopifyOrderGid: "gid://shopify/Order/7777",
          shopifyTransactionGid: "gid://shopify/OrderTransaction/txn_200",
        })
      );
    });

    it("handles missing order_id and transaction id", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-7",
          payloadJson: {
            status: "failure",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          shopifyOrderGid: undefined,
          shopifyTransactionGid: undefined,
        })
      );
    });

    it("defaults to current date when processed_at is missing", async () => {
      const before = new Date();
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "order_transactions/create",
          eventId: "evt-txn-8",
          payloadJson: {
            status: "failure",
            order_id: "5010",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "order_transactions/create",
      });

      const after = new Date();
      const call = mockCreatePaymentSignal.mock.calls[0][0];
      expect(call.occurredAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(call.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("handleOrderCreate", () => {
    it("upserts order with all payload fields", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: {
            id: "9001",
            name: "#1042",
            email: "buyer@example.com",
            financial_status: "paid",
            payment_gateway_names: ["stripe", "gift_card"],
            customer: { id: 500, email: "customer@alt.com" },
            created_at: "2026-03-10T15:00:00Z",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      expect(mockUpsertOrder).toHaveBeenCalledWith({
        shopId: 10,
        shopifyOrderGid: "gid://shopify/Order/9001",
        orderName: "#1042",
        email: "buyer@example.com",
        customerId: "500",
        financialStatus: "paid",
        gatewayNames: ["stripe", "gift_card"],
      });
    });

    it("falls back to customer.email when payload.email is missing", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: {
            id: "9002",
            customer: { id: 501, email: "fallback@example.com" },
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      expect(mockUpsertOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "fallback@example.com",
        })
      );
    });

    it("handles missing customer object", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: {
            id: "9003",
            email: "direct@example.com",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      expect(mockUpsertOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "direct@example.com",
          customerId: undefined,
        })
      );
    });

    it("creates ORDER_CREATED payment signal", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: {
            id: "9004",
            created_at: "2026-03-10T16:30:00Z",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith({
        shopId: 10,
        shopifyOrderGid: "gid://shopify/Order/9004",
        signalType: SignalType.ORDER_CREATED,
        occurredAt: new Date("2026-03-10T16:30:00Z"),
        rawSourceTopic: "orders/create",
      });
    });

    it("defaults signal occurredAt to now when created_at is missing", async () => {
      const before = new Date();
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/create",
          payloadJson: { id: "9005" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/create",
      });

      const after = new Date();
      const call = mockCreatePaymentSignal.mock.calls[0][0];
      expect(call.occurredAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(call.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("handleOrderPaid", () => {
    it("marks order as paid with correct GID", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/paid",
          payloadJson: { id: "8001" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/paid",
      });

      expect(mockMarkOrderPaid).toHaveBeenCalledWith(
        "gid://shopify/Order/8001"
      );
    });

    it("creates ORDER_PAID payment signal", async () => {
      const before = new Date();
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/paid",
          payloadJson: { id: "8002" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/paid",
      });

      const after = new Date();
      expect(mockCreatePaymentSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 10,
          shopifyOrderGid: "gid://shopify/Order/8002",
          signalType: SignalType.ORDER_PAID,
          rawSourceTopic: "orders/paid",
        })
      );
      const call = mockCreatePaymentSignal.mock.calls[0][0];
      expect(call.occurredAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(call.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("silently handles markOrderPaid error when order does not exist", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/paid",
          payloadJson: { id: "8003" },
        })
      );
      mockMarkOrderPaid.mockRejectedValue(
        new Error("Record to update not found")
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/paid",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });
  });

  describe("handleOrderCancelled", () => {
    it("marks order as cancelled with correct GID", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/cancelled",
          payloadJson: { id: "7001" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/cancelled",
      });

      expect(mockMarkOrderCancelled).toHaveBeenCalledWith(
        "gid://shopify/Order/7001"
      );
    });

    it("creates ORDER_CANCELLED payment signal with cancelled_at", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/cancelled",
          payloadJson: {
            id: "7002",
            cancelled_at: "2026-03-10T18:00:00Z",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/cancelled",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalledWith({
        shopId: 10,
        shopifyOrderGid: "gid://shopify/Order/7002",
        signalType: SignalType.ORDER_CANCELLED,
        occurredAt: new Date("2026-03-10T18:00:00Z"),
        rawSourceTopic: "orders/cancelled",
      });
    });

    it("defaults to current date when cancelled_at is missing", async () => {
      const before = new Date();
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/cancelled",
          payloadJson: { id: "7003" },
        })
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/cancelled",
      });

      const after = new Date();
      const call = mockCreatePaymentSignal.mock.calls[0][0];
      expect(call.occurredAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(call.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("silently handles markOrderCancelled error when order does not exist", async () => {
      mockWebhookFindUnique.mockResolvedValue(
        buildEvent({
          topic: "orders/cancelled",
          payloadJson: { id: "7004" },
        })
      );
      mockMarkOrderCancelled.mockRejectedValue(
        new Error("Record to update not found")
      );

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 10,
        topic: "orders/cancelled",
      });

      expect(mockCreatePaymentSignal).toHaveBeenCalled();
      expect(mockMarkEventProcessed).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );
    });
  });
});
