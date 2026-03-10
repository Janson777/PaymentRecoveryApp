import { Link } from "@remix-run/react";

interface RecoveryCaseRowProps {
  recoveryCase: {
    id: number;
    caseType: string;
    caseStatus: string;
    confidenceScore: number;
    openedAt: string;
    checkout?: {
      email?: string | null;
      totalAmount?: string | null;
      currency?: string | null;
    } | null;
  };
}

const STATUS_STYLES: Record<string, string> = {
  CANDIDATE: "bg-yellow-100 text-yellow-700",
  READY: "bg-blue-100 text-blue-700",
  MESSAGING: "bg-blue-100 text-blue-700",
  RECOVERED: "bg-green-100 text-green-700",
  SUPPRESSED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-600",
};

export function RecoveryCaseRow({ recoveryCase }: RecoveryCaseRowProps) {
  const statusStyle =
    STATUS_STYLES[recoveryCase.caseStatus] || "bg-gray-100 text-gray-600";

  return (
    <tr className="transition hover:bg-gray-50">
      <td className="whitespace-nowrap px-6 py-4">
        <Link
          to={`/dashboard/cases/${recoveryCase.id}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          #{recoveryCase.id}
        </Link>
        {recoveryCase.checkout?.email && (
          <p className="text-xs text-gray-500">
            {recoveryCase.checkout.email}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
        {recoveryCase.caseType === "CONFIRMED_DECLINE"
          ? "Confirmed Decline"
          : "Likely Abandonment"}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
        >
          {recoveryCase.caseStatus}
        </span>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-indigo-500"
              style={{ width: `${recoveryCase.confidenceScore}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">
            {recoveryCase.confidenceScore}%
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
        {new Date(recoveryCase.openedAt).toLocaleDateString()}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <Link
          to={`/dashboard/cases/${recoveryCase.id}`}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}
