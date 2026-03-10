import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { getShopId } from "~/lib/session.server";

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
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
          <svg
            className="h-8 w-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Payment Recovery
        </h1>
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
