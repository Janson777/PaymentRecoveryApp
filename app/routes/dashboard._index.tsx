import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { CaseStatus } from "@prisma/client";
import { MetricCard } from "~/components/MetricCard";
import { RecoveryFunnel } from "~/components/RecoveryFunnel";

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
  ]);

  const recoveredRevenue = Number(revenueAggregate._sum.totalAmount ?? 0);
  const currency = shopCurrency?.currency ?? "USD";
  const recoveryRate =
    totalCases > 0 ? Math.round((recoveredCases / totalCases) * 100) : 0;

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
          description="Total recovery emails"
        />
      </div>

      <div className="mt-12 rounded-xl border border-gray-200 bg-white p-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Recovery Funnel
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Track how declined payments convert through your recovery pipeline
        </p>
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
