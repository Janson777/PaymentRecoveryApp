import type { Shop } from "@prisma/client";
import {
  shopifyGraphQL,
  BILLING_MUTATIONS,
  BILLING_QUERIES,
} from "~/services/shopify-api.server";
import { updateShopPlan } from "~/models/shop.server";
import type { PlanTier } from "~/lib/plan.server";

export const PRO_PLAN = {
  name: "Pro",
  price: "39.00",
  currencyCode: "USD",
  interval: "EVERY_30_DAYS" as const,
};

interface AppSubscriptionCreateResult {
  appSubscriptionCreate: {
    userErrors: { field: string; message: string }[];
    appSubscription: { id: string; status: string } | null;
    confirmationUrl: string | null;
  };
}

interface SubscriptionNodeResult {
  node: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  } | null;
}

export async function createProSubscription(
  shop: Shop,
  returnUrl: string
): Promise<{ confirmationUrl: string }> {
  const isTest = process.env.NODE_ENV !== "production";

  const result = await shopifyGraphQL<AppSubscriptionCreateResult>(
    shop,
    BILLING_MUTATIONS.appSubscriptionCreate,
    {
      name: PRO_PLAN.name,
      returnUrl,
      test: isTest,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: parseFloat(PRO_PLAN.price),
                currencyCode: PRO_PLAN.currencyCode,
              },
              interval: PRO_PLAN.interval,
            },
          },
        },
      ],
    }
  );

  const { userErrors, confirmationUrl } = result.appSubscriptionCreate;

  if (userErrors.length > 0) {
    const messages = userErrors.map((e) => e.message).join(", ");
    throw new Error(`Shopify billing error: ${messages}`);
  }

  if (!confirmationUrl) {
    throw new Error("No confirmation URL returned from Shopify");
  }

  return { confirmationUrl };
}

export async function verifySubscription(
  shop: Shop,
  subscriptionGid: string
): Promise<{ id: string; status: string; name: string }> {
  const result = await shopifyGraphQL<SubscriptionNodeResult>(
    shop,
    BILLING_QUERIES.getSubscription,
    { id: subscriptionGid }
  );

  if (!result.node) {
    throw new Error(`Subscription ${subscriptionGid} not found`);
  }

  return {
    id: result.node.id,
    status: result.node.status,
    name: result.node.name,
  };
}

export async function activateProPlan(
  shopId: number,
  subscriptionGid: string
): Promise<void> {
  await updateShopPlan(shopId, "PRO", subscriptionGid, new Date());
  console.log(`Shop ${shopId} upgraded to PRO (subscription: ${subscriptionGid})`);
}

export async function deactivateProPlan(shopId: number): Promise<void> {
  await updateShopPlan(shopId, "FREE", null, null);
  console.log(`Shop ${shopId} downgraded to FREE`);
}

export function mapSubscriptionStatusToPlan(
  status: string
): PlanTier {
  switch (status) {
    case "ACTIVE":
      return "PRO";
    case "CANCELLED":
    case "EXPIRED":
    case "DECLINED":
    case "FROZEN":
      return "FREE";
    default:
      return "FREE";
  }
}
