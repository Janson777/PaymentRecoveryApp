import type { OrdersIndex } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export async function upsertOrder(params: {
  shopId: number;
  shopifyOrderGid: string;
  orderName?: string;
  email?: string;
  customerId?: string;
  financialStatus?: string;
  gatewayNames?: string[];
}): Promise<OrdersIndex> {
  return prisma.ordersIndex.upsert({
    where: { shopifyOrderGid: params.shopifyOrderGid },
    create: {
      shopId: params.shopId,
      shopifyOrderGid: params.shopifyOrderGid,
      orderName: params.orderName,
      email: params.email,
      customerId: params.customerId,
      financialStatus: params.financialStatus,
      gatewayNamesJson: params.gatewayNames ?? [],
    },
    update: {
      financialStatus: params.financialStatus,
      email: params.email,
      gatewayNamesJson: params.gatewayNames ?? undefined,
    },
  });
}

export async function markOrderPaid(
  shopifyOrderGid: string
): Promise<OrdersIndex> {
  return prisma.ordersIndex.update({
    where: { shopifyOrderGid },
    data: { paidAt: new Date() },
  });
}

export async function markOrderCancelled(
  shopifyOrderGid: string
): Promise<OrdersIndex> {
  return prisma.ordersIndex.update({
    where: { shopifyOrderGid },
    data: { cancelledAt: new Date() },
  });
}

export async function findOrderByGid(
  shopifyOrderGid: string
): Promise<OrdersIndex | null> {
  return prisma.ordersIndex.findUnique({
    where: { shopifyOrderGid },
  });
}

export async function findRecentOrderByEmail(
  shopId: number,
  email: string,
  sinceHours: number = 24
): Promise<OrdersIndex | null> {
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  return prisma.ordersIndex.findFirst({
    where: {
      shopId,
      email,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function attributeRecovery(
  shopifyOrderGid: string,
  caseId: number
): Promise<void> {
  await prisma.ordersIndex.update({
    where: { shopifyOrderGid },
    data: { checkoutRecoveryAttributedCaseId: caseId },
  });
}
