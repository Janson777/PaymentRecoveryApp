import { Link } from "@remix-run/react";

interface CaseLimitNudgeProps {
  planTier: "FREE" | "PRO";
  monthlyUsage: number;
  maxCasesPerMonth: number;
}

export function CaseLimitNudge({
  planTier,
  monthlyUsage,
  maxCasesPerMonth,
}: CaseLimitNudgeProps) {
  if (planTier === "PRO") return null;

  const pct = (monthlyUsage / maxCasesPerMonth) * 100;
  if (pct < 70) return null;

  const isLimitReached = monthlyUsage >= maxCasesPerMonth;
  const isUrgent = pct >= 90;

  const colors = isLimitReached
    ? {
        bg: "bg-red-50",
        border: "border-red-200",
        text: "text-red-700",
        count: "text-red-800",
        bar: "bg-red-500",
      }
    : isUrgent
      ? {
          bg: "bg-red-50",
          border: "border-red-100",
          text: "text-red-600",
          count: "text-red-700",
          bar: "bg-red-400",
        }
      : {
          bg: "bg-amber-50",
          border: "border-amber-100",
          text: "text-amber-600",
          count: "text-amber-700",
          bar: "bg-amber-500",
        };

  const message = isLimitReached
    ? "Monthly case limit reached — new cases are paused"
    : isUrgent
      ? `Almost at your monthly case limit`
      : `Approaching your monthly case limit`;

  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border ${colors.border} ${colors.bg} px-4 py-3`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 shrink-0 ${colors.text}`}
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
          <span className={`text-sm font-medium ${colors.text}`}>
            {message}
          </span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${colors.count}`}>
          {monthlyUsage}/{maxCasesPerMonth}
        </span>
        <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-black/5 sm:block">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
      <Link
        to="/dashboard/settings"
        className={`text-xs font-semibold ${colors.text} hover:underline`}
      >
        Upgrade to Pro →
      </Link>
    </div>
  );
}
