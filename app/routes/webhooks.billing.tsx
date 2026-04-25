import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyShopifyHmac } from "~/lib/hmac.server";
import { findShopByDomain } from "~/models/shop.server";
import {
  activateProPlan,
  deactivateProPlan,
  mapSubscriptionStatusToPlan,
} from "~/services/billing.server";

interface BillingWebhookPayload {
  admin_graphql_api_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();

  const topic = request.headers.get("X-Shopify-Topic");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  const hmac = request.headers.get("X-Shopify-Hmac-SHA256");

  if (!topic || !shopDomain || !hmac) {
    return json({ error: "Missing webhook headers" }, { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("SHOPIFY_API_SECRET not configured");
    return json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!verifyShopifyHmac(rawBody, hmac, secret)) {
    return json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const shop = await findShopByDomain(shopDomain);
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const payload: BillingWebhookPayload = JSON.parse(rawBody);
  const newPlanTier = mapSubscriptionStatusToPlan(payload.status);

  if (newPlanTier === "PRO") {
    await activateProPlan(shop.id, payload.admin_graphql_api_id);
  } else {
    await deactivateProPlan(shop.id);
  }

  return json({ ok: true });
}
