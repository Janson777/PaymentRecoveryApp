import type { PaymentSignal } from "@prisma/client";
import type { SignalType } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export async function createPaymentSignal(params: {
  shopId: number;
  checkoutId?: number;
  shopifyOrderGid?: string;
  shopifyTransactionGid?: string;
  signalType: SignalType;
  gateway?: string;
  transactionKind?: string;
  transactionStatus?: string;
  errorCode?: string;
  paymentMethodSummary?: string;
  amount?: number;
  currency?: string;
  occurredAt: Date;
  rawSourceTopic?: string;
  rawSourceEventId?: string;
}): Promise<PaymentSignal> {
  return prisma.paymentSignal.create({
    data: {
      shopId: params.shopId,
      checkoutId: params.checkoutId,
      shopifyOrderGid: params.shopifyOrderGid,
      shopifyTransactionGid: params.shopifyTransactionGid,
      signalType: params.signalType,
      gateway: params.gateway,
      transactionKind: params.transactionKind,
      transactionStatus: params.transactionStatus,
      errorCode: params.errorCode,
      paymentMethodSummary: params.paymentMethodSummary,
      amount: params.amount,
      currency: params.currency,
      occurredAt: params.occurredAt,
      rawSourceTopic: params.rawSourceTopic,
      rawSourceEventId: params.rawSourceEventId,
    },
  });
}

export async function getSignalsForCheckout(
  checkoutId: number
): Promise<PaymentSignal[]> {
  return prisma.paymentSignal.findMany({
    where: { checkoutId },
    orderBy: { occurredAt: "desc" },
  });
}

export async function getSignalsForOrder(
  shopifyOrderGid: string
): Promise<PaymentSignal[]> {
  return prisma.paymentSignal.findMany({
    where: { shopifyOrderGid },
    orderBy: { occurredAt: "desc" },
  });
}
