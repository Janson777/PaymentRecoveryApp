import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { prisma } from "~/lib/db.server";
import { sessionStorage } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }

  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { id: true, shopDomain: true },
    orderBy: { id: "asc" },
  });

  return json({ shops });
}

export async function action({ request }: ActionFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const shopId = Number(formData.get("shopId"));

  if (isNaN(shopId)) {
    return json({ error: "Invalid shop ID" }, { status: 400 });
  }

  const session = await sessionStorage.getSession();
  session.set("shopId", shopId);

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

export default function DevLogin() {
  const { shops } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
            DEV ONLY
          </span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            Dev Login
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Bypass Shopify OAuth — select a shop to log in as.
          </p>
        </div>

        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">
            No shops found. Run <code className="rounded bg-gray-100 px-1">npm run db:seed</code> first.
          </p>
        ) : (
          <div className="space-y-3">
            {shops.map((shop) => (
              <Form key={shop.id} method="post">
                <input type="hidden" name="shopId" value={shop.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {shop.shopDomain}
                    </p>
                    <p className="text-xs text-gray-400">ID: {shop.id}</p>
                  </div>
                  <span className="text-sm text-indigo-600">Login →</span>
                </button>
              </Form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
