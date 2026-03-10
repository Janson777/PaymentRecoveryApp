import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { findShopById } from "~/models/shop.server";
import { DashboardNav } from "~/components/DashboardNav";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request).catch(() => null);
  if (!shopId) {
    return redirect("/");
  }

  const shop = await findShopById(shopId);
  if (!shop) {
    return redirect("/");
  }

  return json({ shopDomain: shop.shopDomain });
}

export default function DashboardLayout() {
  const { shopDomain } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <DashboardNav shopDomain={shopDomain} />
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
