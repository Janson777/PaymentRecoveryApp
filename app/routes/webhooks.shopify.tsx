import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyShopifyHmac } from "~/lib/hmac.server";
import { findShopByDomain, deactivateShop } from "~/models/shop.server";
import {
  persistWebhookEvent,
  type WebhookHeaders,
} from "~/models/webhook-event.server";
import { getWebhookQueue } from "~/queues/webhook.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();

  const headers = extractWebhookHeaders(request);
  if (!headers) {
    return json({ error: "Missing webhook headers" }, { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("SHOPIFY_API_SECRET not configured");
    return json({ error: "Server misconfigured" }, { status: 500 });
  }

  const hmacValid = verifyShopifyHmac(rawBody, headers.hmac, secret);
  if (!hmacValid) {
    return json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const shop = await findShopByDomain(headers.shopDomain);
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const payload = JSON.parse(rawBody);
  const { event, isDuplicate } = await persistWebhookEvent({
    shopId: shop.id,
    headers,
    payload,
    hmacValid,
  });

  if (headers.topic === "app/uninstalled") {
    await deactivateShop(headers.shopDomain);
    return json({ ok: true });
  }

  if (!isDuplicate) {
    const queue = getWebhookQueue();
    await queue.add(`webhook-${event.id}`, {
      webhookEventId: event.id,
      shopId: shop.id,
      topic: headers.topic,
    });
  }

  return json({ ok: true });
}

function extractWebhookHeaders(
  request: Request
): WebhookHeaders | null {
  const topic = request.headers.get("X-Shopify-Topic");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  const apiVersion = request.headers.get("X-Shopify-API-Version");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  const eventId = request.headers.get("X-Shopify-Event-Id");
  const triggeredAt = request.headers.get("X-Shopify-Triggered-At");
  const hmac = request.headers.get("X-Shopify-Hmac-SHA256");

  if (
    !topic ||
    !shopDomain ||
    !apiVersion ||
    !webhookId ||
    !eventId ||
    !triggeredAt ||
    !hmac
  ) {
    return null;
  }

  return { topic, shopDomain, apiVersion, webhookId, eventId, triggeredAt, hmac };
}
