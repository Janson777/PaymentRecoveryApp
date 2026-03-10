export function MetricCard({
  title,
  value,
  description,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 transition hover:shadow-md">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold tracking-tight text-gray-900">
          {value}
        </p>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend === "up" ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}
