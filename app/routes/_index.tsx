import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { getShopId } from "~/lib/session.server";
import { BitPushyLogo } from "~/components/BitPushyLogo";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await getShopId(request);
  if (shopId) {
    return redirect("/dashboard");
  }
  return null;
}

export default function Index() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center max-w-lg px-6">
        <BitPushyLogo className="mx-auto mb-6 h-12 text-gray-900" />
        <p className="mt-3 text-lg text-gray-600">
          Recover sales lost to declined payments. Convert failed payment
          attempts into completed orders.
        </p>

        <Form
          method="get"
          action="/auth/shopify"
          className="mt-8 flex flex-col items-center gap-3"
        >
          <div className="flex w-full max-w-sm items-center gap-2">
            <input
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              required
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
          >
            {isSubmitting ? "Redirecting…" : "Install on Shopify"}
          </button>
          <p className="text-xs text-gray-400">
            Enter your Shopify store domain to get started
          </p>
        </Form>
      </div>
    </div>
  );
}
