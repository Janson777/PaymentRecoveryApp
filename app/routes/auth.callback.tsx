import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  exchangeCodeForToken,
  registerWebhooks,
} from "~/services/shopify-api.server";
import { upsertShop } from "~/models/shop.server";
import { sessionStorage } from "~/lib/session.server";
import {
  isValidShopDomain,
  sanitizeShopDomain,
  verifyOAuthHmac,
} from "~/lib/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawShop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const hmac = url.searchParams.get("hmac");

  if (!rawShop || !code || !state || !hmac) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const shop = sanitizeShopDomain(rawShop);
  if (!isValidShopDomain(shop)) {
    throw new Response("Invalid shop domain", { status: 400 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Response("Server misconfigured", { status: 500 });
  }

  if (!verifyOAuthHmac(url.searchParams, secret)) {
    throw new Response("Invalid HMAC signature", { status: 403 });
  }

  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  const storedNonce = session.get("oauthNonce");
  const storedShop = session.get("oauthShop");

  if (!storedNonce || state !== storedNonce) {
    throw new Response("Invalid state parameter", { status: 403 });
  }

  if (storedShop && storedShop !== shop) {
    throw new Response("Shop mismatch", { status: 403 });
  }

  const accessToken = await exchangeCodeForToken(shop, code);

  const savedShop = await upsertShop({
    shopDomain: shop,
    accessToken,
    apiVersion: "2024-10",
  });

  registerWebhooks(shop, accessToken).catch((err) =>
    console.error("Webhook registration error:", err)
  );

  session.unset("oauthNonce");
  session.unset("oauthShop");
  session.set("shopId", savedShop.id);
  session.set("shopDomain", savedShop.shopDomain);

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
