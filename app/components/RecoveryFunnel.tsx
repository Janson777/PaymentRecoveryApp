import { useState, useEffect } from "react";

interface RecoveryFunnelProps {
  declinedPayments: number;
  messagesSent: number;
  linksClicked: number;
  ordersRecovered: number;
}

const STAGES = [
  { key: "declined", label: "Declined Payments", colorClass: "bg-slate-400", icon: "⚠" },
  { key: "sent", label: "Messages Sent", colorClass: "bg-indigo-400", icon: "✉" },
  { key: "clicked", label: "Links Clicked", colorClass: "bg-indigo-600", icon: "🔗" },
  { key: "recovered", label: "Orders Recovered", colorClass: "bg-emerald-500", icon: "✓" },
] as const;

export function RecoveryFunnel({
  declinedPayments,
  messagesSent,
  linksClicked,
  ordersRecovered,
}: RecoveryFunnelProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const counts = [declinedPayments, messagesSent, linksClicked, ordersRecovered];
  const maxCount = counts[0] || 1;
  const hasData = counts[0] > 0;

  if (!hasData) {
    return (
      <div className="mt-6 flex items-center justify-center py-12 text-sm text-gray-400 italic">
        Funnel visualization will appear once decline data is available.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-1">
      {STAGES.map((stage, i) => {
        const count = counts[i];
        const widthPercent = Math.max(
          count > 0 ? 10 : 2,
          (count / maxCount) * 100
        );
        const overallPercent =
          i === 0 ? 100 : Math.round((count / counts[0]) * 100);
        const conversionRate =
          i > 0 && counts[i - 1] > 0
            ? Math.round((count / counts[i - 1]) * 100)
            : null;

        return (
          <div key={stage.key}>
            {i > 0 && (
              <div className="flex items-center gap-1.5 py-1.5 pl-1">
                <span className="text-[10px] text-gray-300">↓</span>
                {conversionRate !== null && (
                  <span className="text-[11px] font-medium text-gray-400">
                    {conversionRate}% conversion
                  </span>
                )}
              </div>
            )}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-700">
                  <span className="mr-1.5 text-xs">{stage.icon}</span>
                  {stage.label}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold tabular-nums text-gray-900">
                    {count}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400">
                    {overallPercent}%
                  </span>
                </div>
              </div>
              <div className="h-10 w-full overflow-hidden rounded-lg bg-gray-100">
                <div
                  className={`flex h-full items-center rounded-lg ${stage.colorClass} transition-all ease-out`}
                  style={{
                    width: animate ? `${widthPercent}%` : "0%",
                    transitionDuration: "800ms",
                    transitionDelay: `${i * 150}ms`,
                  }}
                >
                  {widthPercent > 25 && (
                    <span className="truncate pl-3 text-xs font-semibold text-white/90">
                      {count} {stage.label.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
