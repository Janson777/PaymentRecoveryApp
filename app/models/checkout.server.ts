import type { Checkout } from "@prisma/client";
import { CheckoutStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export async function upsertCheckout(params: {
  shopId: number;
  shopifyCheckoutId?: string;
  checkoutToken?: string;
  email?: string;
  phone?: string;
  customerId?: string;
  currency?: string;
  subtotalAmount?: number;
  totalAmount?: number;
  lineItemsHash?: string;
}): Promise<Checkout> {
  const now = new Date();

  if (params.shopifyCheckoutId) {
    const existing = await prisma.checkout.findFirst({
      where: {
        shopId: params.shopId,
        shopifyCheckoutId: params.shopifyCheckoutId,
      },
    });

    if (existing) {
      return prisma.checkout.update({
        where: { id: existing.id },
        data: {
          email: params.email ?? existing.email,
          phone: params.phone ?? existing.phone,
          customerId: params.customerId ?? existing.customerId,
          currency: params.currency ?? existing.currency,
          subtotalAmount: params.subtotalAmount ?? existing.subtotalAmount,
          totalAmount: params.totalAmount ?? existing.totalAmount,
          lineItemsHash: params.lineItemsHash ?? existing.lineItemsHash,
          lastSeenAt: now,
        },
      });
    }
  }

  return prisma.checkout.create({
    data: {
      shopId: params.shopId,
      shopifyCheckoutId: params.shopifyCheckoutId,
      checkoutToken: params.checkoutToken,
      email: params.email,
      phone: params.phone,
      customerId: params.customerId,
      currency: params.currency,
      subtotalAmount: params.subtotalAmount,
      totalAmount: params.totalAmount,
      lineItemsHash: params.lineItemsHash,
      startedAt: now,
      lastSeenAt: now,
    },
  });
}

export async function markCheckoutAbandoned(
  checkoutId: number,
  recoveryUrl: string
): Promise<Checkout> {
  return prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      checkoutStatus: CheckoutStatus.ABANDONED,
      abandonedAt: new Date(),
      recoveryUrl,
    },
  });
}

export async function markCheckoutRecovered(
  checkoutId: number
): Promise<Checkout> {
  return prisma.checkout.update({
    where: { id: checkoutId },
    data: {
      checkoutStatus: CheckoutStatus.RECOVERED,
      recoveredAt: new Date(),
    },
  });
}

export async function findCheckoutByShopifyId(
  shopId: number,
  shopifyCheckoutId: string
): Promise<Checkout | null> {
  return prisma.checkout.findFirst({
    where: { shopId, shopifyCheckoutId },
  });
}

export async function getActiveCheckouts(
  shopId: number
): Promise<Checkout[]> {
  return prisma.checkout.findMany({
    where: {
      shopId,
      checkoutStatus: CheckoutStatus.ACTIVE,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}
