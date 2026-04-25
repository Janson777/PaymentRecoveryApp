import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { CaseStatus } from "@prisma/client";
import { findShopById } from "~/models/shop.server";
import { getMonthlyUsageCount, FREE_CASES_LIMIT } from "~/lib/plan.server";
import type { PlanTier } from "~/lib/plan.server";
import { parseShopSettings } from "~/lib/settings";
import { MetricCard } from "~/components/MetricCard";
import { RecoveryFunnel } from "~/components/RecoveryFunnel";
import { UsageLimitBanner } from "~/components/UsageLimitBanner";
import { DashboardPhoneReminder } from "~/components/DashboardPhoneReminder";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);

  const [
    totalCases,
    recoveredCases,
    activeCases,
    messagesSent,
    revenueAggregate,
    shopCurrency,
    casesMessaged,
    casesClicked,
    shop,
    monthlyUsage,
  ] = await Promise.all([
    prisma.recoveryCase.count({ where: { shopId } }),
    prisma.recoveryCase.count({
      where: { shopId, caseStatus: CaseStatus.RECOVERED },
    }),
    prisma.recoveryCase.count({
      where: {
        shopId,
        caseStatus: {
          in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING],
        },
      },
    }),
    prisma.recoveryMessage.count({
      where: {
        recoveryCase: { shopId },
        sentAt: { not: null },
      },
    }),
    prisma.checkout.aggregate({
      where: {
        recoveryCases: {
          some: {
            shopId,
            caseStatus: CaseStatus.RECOVERED,
          },
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    prisma.checkout.findFirst({
      where: {
        shopId,
        currency: { not: null },
      },
      select: { currency: true },
    }),
    prisma.recoveryCase.count({
      where: {
        shopId,
        recoveryMessages: {
          some: { sentAt: { not: null } },
        },
      },
    }),
    prisma.recoveryCase.count({
      where: {
        shopId,
        recoveryMessages: {
          some: { clickedAt: { not: null } },
        },
      },
    }),
    findShopById(shopId),
    getMonthlyUsageCount(shopId),
  ]);

  const recoveredRevenue = Number(revenueAggregate._sum.totalAmount ?? 0);
  const currency = shopCurrency?.currency ?? "USD";
  const recoveryRate =
    totalCases > 0 ? Math.round((recoveredCases / totalCases) * 100) : 0;
  const planTier: PlanTier = shop?.planTier === "PRO" ? "PRO" : "FREE";
  const settings = parseShopSettings(shop?.settingsJson);
  const smsEnabled = settings.smsEnabled;
  const shopDomain = shop?.shopDomain ?? "";

  return json({
    totalCases,
    recoveredCases,
    activeCases,
    messagesSent,
    recoveryRate,
    recoveredRevenue,
    currency,
    casesMessaged,
    casesClicked,
    planTier,
    monthlyUsage,
    maxCasesPerMonth: FREE_CASES_LIMIT,
    smsEnabled,
    shopDomain,
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DashboardIndex() {
  const data = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recovery performance at a glance
        </p>
      </div>

      {data.planTier === "PRO" && data.smsEnabled && (
        <DashboardPhoneReminder shopDomain={data.shopDomain} />
      )}

      <UsageLimitBanner
        planTier={data.planTier}
        monthlyUsage={data.monthlyUsage}
        maxCasesPerMonth={data.maxCasesPerMonth}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-5 lg:grid-cols-3">
        <MetricCard
          title="Recovery Rate"
          value={`${data.recoveryRate}%`}
          description="Recovered / total cases"
          trend="up"
        />
        <MetricCard
          title="Recovered Revenue"
          value={formatCurrency(data.recoveredRevenue, data.currency)}
          description="Total revenue recovered"
          trend="up"
        />
        <MetricCard
          title="Recovered Orders"
          value={data.recoveredCases.toString()}
          description="Successfully recovered"
          trend="up"
        />
        <MetricCard
          title="Active Cases"
          value={data.activeCases.toString()}
          description="Currently in recovery"
        />
        <MetricCard
          title="Messages Sent"
          value={data.messagesSent.toString()}
          description="Total recovery messages"
        />
      </div>

      <div className="mt-12 rounded-xl border border-gray-200 bg-white p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Recovery Funnel
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Track how declined payments convert through your recovery pipeline
            </p>
          </div>
          {data.planTier === "FREE" && (
            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                  clipRule="evenodd"
                />
              </svg>
              Unlock advanced analytics with Pro
            </Link>
          )}
        </div>
        <RecoveryFunnel
          declinedPayments={data.totalCases}
          messagesSent={data.casesMessaged}
          linksClicked={data.casesClicked}
          ordersRecovered={data.recoveredCases}
        />
      </div>
    </div>
  );
}
