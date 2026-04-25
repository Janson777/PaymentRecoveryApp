import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireShopId } from "~/lib/session.server";
import { findShopById } from "~/models/shop.server";
import {
  verifySubscription,
  activateProPlan,
} from "~/services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);
  const shop = await findShopById(shopId);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) {
    console.warn(`Billing callback missing charge_id for shop ${shopId}`);
    return redirect("/dashboard/settings");
  }

  const subscriptionGid = chargeId.startsWith("gid://")
    ? chargeId
    : `gid://shopify/AppSubscription/${chargeId}`;

  const subscription = await verifySubscription(shop, subscriptionGid);

  if (subscription.status === "ACTIVE") {
    await activateProPlan(shopId, subscription.id);
  } else {
    console.warn(
      `Subscription ${chargeId} for shop ${shopId} has status: ${subscription.status}`
    );
  }

  return redirect("/dashboard/settings");
}
