import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getShopifyOAuthUrl } from "~/services/shopify-api.server";
import { isValidShopDomain, sanitizeShopDomain } from "~/lib/shopify.server";
import { sessionStorage } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawShop = url.searchParams.get("shop");

  if (!rawShop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  const shop = sanitizeShopDomain(rawShop);
  if (!isValidShopDomain(shop)) {
    throw new Response("Invalid shop domain", { status: 400 });
  }

  const nonce = crypto.randomUUID();
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  session.set("oauthNonce", nonce);
  session.set("oauthShop", shop);

  const oauthUrl = getShopifyOAuthUrl(shop, nonce);

  return redirect(oauthUrl, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
