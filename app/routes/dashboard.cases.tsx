import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { getCasesByShop } from "~/models/recovery-case.server";
import { CaseStatus } from "@prisma/client";
import { RecoveryCaseRow } from "~/components/RecoveryCaseRow";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Active", value: "CANDIDATE,READY,MESSAGING" },
  { label: "Recovered", value: "RECOVERED" },
  { label: "Suppressed", value: "SUPPRESSED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Cancelled", value: "CANCELLED" },
] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || undefined;
  const statuses = statusParam
    ? (statusParam.split(",").filter((s): s is CaseStatus =>
        Object.values(CaseStatus).includes(s as CaseStatus)
      ))
    : undefined;

  const cases = await getCasesByShop(shopId, statuses);

  return json({ cases });
}

export default function DashboardCases() {
  const { cases } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentStatus = searchParams.get("status") || "";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Recovery Cases</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track and manage payment recovery attempts
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              if (filter.value) {
                params.set("status", filter.value);
              } else {
                params.delete("status");
              }
              setSearchParams(params);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              currentStatus === filter.value
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {cases.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-lg font-medium">No recovery cases yet</p>
            <p className="mt-1 text-sm">
              Cases will appear here when declined payments are detected.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Case
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Opened
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cases.map((recoveryCase) => (
                <RecoveryCaseRow
                  key={recoveryCase.id}
                  recoveryCase={recoveryCase}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
