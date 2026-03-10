import { ProcessingStatus, SignalType } from "@prisma/client";
import { markEventProcessed } from "~/models/webhook-event.server";
import { upsertCheckout } from "~/models/checkout.server";
import { createPaymentSignal } from "~/models/payment-signal.server";
import { upsertOrder, markOrderPaid, markOrderCancelled } from "~/models/order.server";
import { prisma } from "~/lib/db.server";
import { findShopById } from "~/models/shop.server";
import type { WebhookJobData } from "~/queues/webhook.server";

export async function processWebhookEvent(
  data: WebhookJobData
): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: data.webhookEventId },
  });

  if (!event) {
    console.error(`Webhook event ${data.webhookEventId} not found`);
    return;
  }

  try {
    const payload = event.payloadJson as Record<string, unknown>;

    switch (event.topic) {
      case "checkouts/create":
        await handleCheckoutCreate(event.shopId, payload);
        break;
      case "checkouts/update":
        await handleCheckoutUpdate(event.shopId, payload);
        break;
      case "order_transactions/create":
        await handleOrderTransaction(event.shopId, payload, event.eventId);
        break;
      case "orders/create":
        await handleOrderCreate(event.shopId, payload);
        break;
      case "orders/paid":
        await handleOrderPaid(event.shopId, payload);
        break;
      case "orders/cancelled":
        await handleOrderCancelled(event.shopId, payload);
        break;
      default:
        console.warn(`Unhandled webhook topic: ${event.topic}`);
    }

    await markEventProcessed(event.id, ProcessingStatus.PROCESSED);
  } catch (error) {
    console.error(`Error processing webhook ${event.id}:`, error);
    await markEventProcessed(event.id, ProcessingStatus.FAILED);
    throw error;
  }
}

async function handleCheckoutCreate(
  shopId: number,
  payload: Record<string, unknown>
): Promise<void> {
  await upsertCheckout({
    shopId,
    shopifyCheckoutId: payload.id as string | undefined,
    checkoutToken: payload.token as string | undefined,
    email: payload.email as string | undefined,
    phone: payload.phone as string | undefined,
    customerId: payload.customer_id as string | undefined,
    currency: payload.currency as string | undefined,
    totalAmount: payload.total_price ? Number(payload.total_price) : undefined,
    subtotalAmount: payload.subtotal_price
      ? Number(payload.subtotal_price)
      : undefined,
  });
}

async function handleCheckoutUpdate(
  shopId: number,
  payload: Record<string, unknown>
): Promise<void> {
  await upsertCheckout({
    shopId,
    shopifyCheckoutId: payload.id as string | undefined,
    checkoutToken: payload.token as string | undefined,
    email: payload.email as string | undefined,
    phone: payload.phone as string | undefined,
    customerId: payload.customer_id as string | undefined,
    currency: payload.currency as string | undefined,
    totalAmount: payload.total_price ? Number(payload.total_price) : undefined,
    subtotalAmount: payload.subtotal_price
      ? Number(payload.subtotal_price)
      : undefined,
  });
}

async function handleOrderTransaction(
  shopId: number,
  payload: Record<string, unknown>,
  eventId: string
): Promise<void> {
  const status = (payload.status as string)?.toUpperCase();
  const kind = payload.kind as string | undefined;
  const errorCode = payload.error_code as string | undefined;
  const gateway = payload.gateway as string | undefined;
  const amount = payload.amount ? Number(payload.amount) : undefined;
  const currency = payload.currency as string | undefined;
  const orderGid = payload.order_id
    ? `gid://shopify/Order/${payload.order_id}`
    : undefined;

  let signalType: SignalType;
  if (status === "FAILURE") {
    signalType = SignalType.TRANSACTION_FAILURE;
  } else if (status === "ERROR") {
    signalType = SignalType.TRANSACTION_ERROR;
  } else if (status === "SUCCESS") {
    signalType = SignalType.TRANSACTION_SUCCESS;
  } else {
    return;
  }

  await createPaymentSignal({
    shopId,
    shopifyOrderGid: orderGid,
    shopifyTransactionGid: payload.id
      ? `gid://shopify/OrderTransaction/${payload.id}`
      : undefined,
    signalType,
    gateway,
    transactionKind: kind,
    transactionStatus: status,
    errorCode,
    amount,
    currency,
    occurredAt: payload.processed_at
      ? new Date(payload.processed_at as string)
      : new Date(),
    rawSourceTopic: "order_transactions/create",
    rawSourceEventId: eventId,
  });
}

async function handleOrderCreate(
  shopId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const orderGid = `gid://shopify/Order/${payload.id}`;
  const customer = payload.customer as Record<string, unknown> | undefined;

  await upsertOrder({
    shopId,
    shopifyOrderGid: orderGid,
    orderName: payload.name as string | undefined,
    email: (payload.email as string) ?? (customer?.email as string | undefined),
    customerId: customer?.id ? String(customer.id) : undefined,
    financialStatus: payload.financial_status as string | undefined,
    gatewayNames: payload.payment_gateway_names as string[] | undefined,
  });

  await createPaymentSignal({
    shopId,
    shopifyOrderGid: orderGid,
    signalType: SignalType.ORDER_CREATED,
    occurredAt: payload.created_at
      ? new Date(payload.created_at as string)
      : new Date(),
    rawSourceTopic: "orders/create",
  });
}

async function handleOrderPaid(
  shopId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const orderGid = `gid://shopify/Order/${payload.id}`;

  await markOrderPaid(orderGid).catch(() => {
    // Order may not exist yet if orders/create hasn't been processed
  });

  await createPaymentSignal({
    shopId,
    shopifyOrderGid: orderGid,
    signalType: SignalType.ORDER_PAID,
    occurredAt: new Date(),
    rawSourceTopic: "orders/paid",
  });
}

async function handleOrderCancelled(
  shopId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const orderGid = `gid://shopify/Order/${payload.id}`;

  await markOrderCancelled(orderGid).catch(() => {});

  await createPaymentSignal({
    shopId,
    shopifyOrderGid: orderGid,
    signalType: SignalType.ORDER_CANCELLED,
    occurredAt: payload.cancelled_at
      ? new Date(payload.cancelled_at as string)
      : new Date(),
    rawSourceTopic: "orders/cancelled",
  });
}
