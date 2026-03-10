import type { Shop } from "@prisma/client";
import { shopifyGraphQL, QUERIES } from "./shopify-api.server";
import {
  findCheckoutByShopifyId,
  markCheckoutAbandoned,
  markCheckoutRecovered,
} from "~/models/checkout.server";
import { evaluateAbandonedCheckout } from "./decline-detection.server";
import { expireOldCases, promoteReadyCases } from "./recovery-workflow.server";
import { getActiveShops } from "~/models/shop.server";
import type { ReconciliationJobData } from "~/queues/reconciliation.server";

interface AbandonedCheckoutNode {
  id: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  abandonedCheckoutUrl: string;
  totalPriceSet: {
    shopMoney: { amount: string; currencyCode: string };
  };
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface AbandonedCheckoutsResponse {
  abandonedCheckouts: {
    edges: Array<{ node: AbandonedCheckoutNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export async function processReconciliation(
  data: ReconciliationJobData
): Promise<void> {
  switch (data.jobType) {
    case "abandoned_checkout":
      await reconcileAbandonedCheckouts(data.shopId);
      break;
    case "orphan_reconciliation":
      await reconcileOrphans();
      break;
  }
}

async function reconcileAbandonedCheckouts(
  shopId: number
): Promise<void> {
  const { findShopById } = await import("~/models/shop.server");
  const shop = await findShopById(shopId);
  if (!shop || !shop.isActive) return;

  const response = await shopifyGraphQL<AbandonedCheckoutsResponse>(
    shop,
    QUERIES.abandonedCheckouts,
    { first: 50 }
  );

  for (const edge of response.abandonedCheckouts.edges) {
    const node = edge.node;
    await processAbandonedCheckoutNode(shop, node);
  }

  await promoteReadyCases();
}

async function processAbandonedCheckoutNode(
  shop: Shop,
  node: AbandonedCheckoutNode
): Promise<void> {
  const shopifyCheckoutId = node.id.replace(
    "gid://shopify/AbandonedCheckout/",
    ""
  );

  const checkout = await findCheckoutByShopifyId(shop.id, shopifyCheckoutId);

  if (!checkout) return;

  if (node.completedAt) {
    await markCheckoutRecovered(checkout.id);
    return;
  }

  if (checkout.checkoutStatus === "ACTIVE") {
    await markCheckoutAbandoned(checkout.id, node.abandonedCheckoutUrl);

    const hasContact = !!node.customer?.email || !!node.customer?.phone;
    const totalAmount = parseFloat(
      node.totalPriceSet.shopMoney.amount
    );

    await evaluateAbandonedCheckout({
      shopId: shop.id,
      checkoutId: checkout.id,
      hasContactInfo: hasContact,
      hasShippingInfo: true,
      totalAmount,
    });
  }
}

async function reconcileOrphans(): Promise<void> {
  await expireOldCases();
  await promoteReadyCases();
}

export async function scheduleReconciliationJobs(): Promise<void> {
  const { getReconciliationQueue } = await import(
    "~/queues/reconciliation.server"
  );
  const queue = getReconciliationQueue();
  const shops = await getActiveShops();

  for (const shop of shops) {
    await queue.add(
      `reconcile-abandoned-${shop.id}`,
      { shopId: shop.id, jobType: "abandoned_checkout" },
      {
        repeat: { every: 10 * 60_000 },
        jobId: `reconcile-abandoned-${shop.id}`,
      }
    );
  }

  await queue.add(
    "reconcile-orphans",
    { shopId: 0, jobType: "orphan_reconciliation" },
    {
      repeat: { every: 30 * 60_000 },
      jobId: "reconcile-orphans",
    }
  );
}
