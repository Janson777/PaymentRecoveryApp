import { Form } from "@remix-run/react";

interface PlanCardProps {
  planTier: "FREE" | "PRO";
  billingActivatedAt: string | null;
  monthlyUsage: number;
  maxCasesPerMonth: number;
}

const FREE_FEATURES = [
  "Decline-specific detection",
  "2-step email sequence",
  "Smart suppression",
  "Basic recovery dashboard",
];

const PRO_FEATURES = [
  "Unlimited recovery cases",
  "3-step recovery sequences",
  "SMS + Email channels",
  "Advanced analytics",
  "Custom sending domain",
  "Priority support",
];

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / limit) * 100, 100);
  const barColor =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-500"
        : "bg-indigo-500";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-gray-700">
          {used} <span className="text-gray-400">/ {limit}</span>
        </span>
        <span className="text-xs text-gray-400">cases this month</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct >= 90 && (
        <p className="mt-1.5 text-xs font-medium text-red-600">
          {used >= limit
            ? "Monthly limit reached — new cases are paused"
            : "Approaching monthly limit"}
        </p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function PlanCard({
  planTier,
  billingActivatedAt,
  monthlyUsage,
  maxCasesPerMonth,
}: PlanCardProps) {
  if (planTier === "PRO") {
    return <ProPlanCard billingActivatedAt={billingActivatedAt} />;
  }

  return <FreePlanCard monthlyUsage={monthlyUsage} maxCasesPerMonth={maxCasesPerMonth} />;
}

function FreePlanCard({ monthlyUsage, maxCasesPerMonth }: { monthlyUsage: number; maxCasesPerMonth: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Current plan */}
        <div className="flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-gray-900">
                Current Plan
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Starter
              </span>
            </div>

            <div className="mt-5">
              <UsageBar used={monthlyUsage} limit={maxCasesPerMonth} />
            </div>

            <ul className="mt-6 space-y-2.5">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upgrade section */}
        <div className="flex flex-col justify-between rounded-br-xl border-l border-gray-100 bg-gradient-to-br from-indigo-50/80 via-white to-white p-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-indigo-900">
                Upgrade to Pro
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tracking-tight text-indigo-900">
                  $39
                </span>
                <span className="text-sm text-indigo-400">/mo</span>
              </div>
            </div>

            <p className="mt-3 text-sm text-indigo-700/70">
              Recover more revenue with multi-channel sequences and unlimited
              cases.
            </p>

            <ul className="mt-5 space-y-2.5">
              {PRO_FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-indigo-900"
                >
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <Form method="post" action="/billing/subscribe" className="mt-6">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Upgrade to Pro
              <svg
                className="ml-1.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}

function ProPlanCard({
  billingActivatedAt,
}: {
  billingActivatedAt: string | null;
}) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-white">
      <div className="flex items-center justify-between border-b border-indigo-100 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
          Pro
        </span>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              $39
            </span>
            <span className="text-sm text-gray-400">/month</span>
          </div>
          {billingActivatedAt && (
            <span className="text-sm text-gray-500">
              Active since {formatDate(billingActivatedAt)}
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {PRO_FEATURES.map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-2 text-sm text-gray-700"
            >
              <CheckIcon />
              {feature}
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-gray-400">
          Subscription is managed through your Shopify admin.
        </p>
      </div>
    </div>
  );
}
