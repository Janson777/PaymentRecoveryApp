import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { verifyShopifyHmac } from "~/lib/hmac.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-SHA256");
  const topic = request.headers.get("X-Shopify-Topic");

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmac) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!verifyShopifyHmac(rawBody, hmac, secret)) {
    return json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  switch (topic) {
    case "customers/data_request":
      console.log(
        "GDPR: Customer data request for shop",
        payload.shop_domain
      );
      break;

    case "customers/redact":
      console.log(
        "GDPR: Customer redact request for shop",
        payload.shop_domain,
        "customer",
        payload.customer?.id
      );
      break;

    case "shop/redact":
      console.log(
        "GDPR: Shop redact request for",
        payload.shop_domain
      );
      break;

    default:
      console.log("GDPR: Unknown topic", topic);
  }

  return json({ ok: true });
}
