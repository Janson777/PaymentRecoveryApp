import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireShopId } from "~/lib/session.server";
import { findShopById } from "~/models/shop.server";
import { createProSubscription } from "~/services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return redirect("/dashboard/settings");
}

export async function action({ request }: ActionFunctionArgs) {
  const shopId = await requireShopId(request);
  const shop = await findShopById(shopId);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  if (shop.planTier === "PRO") {
    return redirect("/dashboard/settings");
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const returnUrl = `${appUrl}/billing/callback`;

  const { confirmationUrl } = await createProSubscription(shop, returnUrl);

  return redirect(confirmationUrl);
}
