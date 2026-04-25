import { NavLink, Link } from "@remix-run/react";
import { BitPushyLogo } from "~/components/BitPushyLogo";

const NAV_ITEMS = [
  { label: "Overview", to: "/dashboard", end: true },
  { label: "Recovery Cases", to: "/dashboard/cases", end: false },
  { label: "Settings", to: "/dashboard/settings", end: false },
];

export function DashboardNav({
  shopDomain,
  planTier,
}: {
  shopDomain: string;
  planTier: "FREE" | "PRO";
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
          <svg
            className="h-5 w-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
            />
          </svg>
        </div>
        <BitPushyLogo className="h-7 text-gray-900" />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {planTier === "FREE" && (
        <div className="mx-3 mb-3 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-4 text-white shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-indigo-200"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-semibold">Upgrade to Pro</span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-indigo-100">
            Unlimited cases, SMS recovery, and 3-step sequences.
          </p>
          <Link
            to="/dashboard/settings"
            className="block rounded-lg bg-white px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
          >
            View Plans
          </Link>
        </div>
      )}

      <div className="border-t border-gray-200 px-4 py-4">
        <p className="truncate text-xs text-gray-400">{shopDomain}</p>
      </div>
    </aside>
  );
}
