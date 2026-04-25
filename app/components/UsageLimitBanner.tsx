import { Link } from "@remix-run/react";

interface UsageLimitBannerProps {
  planTier: "FREE" | "PRO";
  monthlyUsage: number;
  maxCasesPerMonth: number;
}

export function UsageLimitBanner({
  planTier,
  monthlyUsage,
  maxCasesPerMonth,
}: UsageLimitBannerProps) {
  if (planTier === "PRO") return null;

  const pct = (monthlyUsage / maxCasesPerMonth) * 100;
  if (pct < 70) return null;

  const isLimitReached = monthlyUsage >= maxCasesPerMonth;
  const isUrgent = pct >= 90;

  const colors = isLimitReached
    ? {
        bg: "bg-red-100",
        border: "border-red-300",
        text: "text-red-900",
        subtext: "text-red-700",
        bar: "bg-red-600",
        icon: "text-red-600",
        link: "bg-red-700 hover:bg-red-800 text-white",
      }
    : isUrgent
      ? {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-800",
          subtext: "text-red-600",
          bar: "bg-red-400",
          icon: "text-red-400",
          link: "bg-red-600 hover:bg-red-700 text-white",
        }
      : {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-800",
          subtext: "text-amber-600",
          bar: "bg-amber-500",
          icon: "text-amber-500",
          link: "bg-amber-600 hover:bg-amber-700 text-white",
        };

  const message = isLimitReached
    ? "Monthly limit reached — new recovery cases are paused"
    : isUrgent
      ? `Almost at your monthly limit — ${monthlyUsage} of ${maxCasesPerMonth} cases used`
      : `Approaching your monthly limit — ${monthlyUsage} of ${maxCasesPerMonth} cases used`;

  return (
    <div className={`mb-6 rounded-xl border ${colors.border} ${colors.bg} p-4`}>
      <div className="flex items-start gap-3">
        <svg
          className={`mt-0.5 h-5 w-5 shrink-0 ${colors.icon}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          {isLimitReached ? (
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          ) : (
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          )}
        </svg>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <p className={`text-sm font-semibold ${colors.text}`}>
                {message}
              </p>
              <div className="mt-2.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className={`mt-1.5 text-xs ${colors.subtext}`}>
                {monthlyUsage} / {maxCasesPerMonth} cases this month
              </p>
            </div>

            <Link
              to="/dashboard/settings"
              className={`inline-flex shrink-0 items-center rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition ${colors.link}`}
            >
              Upgrade to Pro
              <svg
                className="ml-1 h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
