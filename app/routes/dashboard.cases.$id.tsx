import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { getCaseById } from "~/models/recovery-case.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireShopId(request);
  const caseId = Number(params.id);

  if (isNaN(caseId)) {
    throw new Response("Invalid case ID", { status: 400 });
  }

  const recoveryCase = await getCaseById(caseId);
  if (!recoveryCase) {
    throw new Response("Case not found", { status: 404 });
  }

  return json({ recoveryCase });
}

export default function CaseDetail() {
  const { recoveryCase } = useLoaderData<typeof loader>();
  const messages = (recoveryCase as Record<string, unknown>).recoveryMessages as Array<{
    id: number;
    sequenceStep: number;
    channel: string;
    scheduledFor: string;
    sentAt: string | null;
    deliveryStatus: string;
    openedAt: string | null;
    clickedAt: string | null;
  }>;
  const checkout = (recoveryCase as Record<string, unknown>).checkout as {
    email?: string;
    totalAmount?: string;
    currency?: string;
    recoveryUrl?: string;
  } | null;

  return (
    <div>
      <div className="mb-8">
        <Link
          to="/dashboard/cases"
          className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Cases
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Case #{recoveryCase.id}
        </h1>
        <div className="mt-2 flex gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              recoveryCase.caseStatus === "RECOVERED"
                ? "bg-green-100 text-green-700"
                : recoveryCase.caseStatus === "MESSAGING"
                  ? "bg-blue-100 text-blue-700"
                  : recoveryCase.caseStatus === "CANDIDATE"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700"
            }`}
          >
            {recoveryCase.caseStatus}
          </span>
          <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
            {recoveryCase.caseType.replace("_", " ")}
          </span>
          <span className="text-sm text-gray-500">
            Confidence: {recoveryCase.confidenceScore}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Opened</dt>
              <dd className="text-sm text-gray-900">
                {new Date(recoveryCase.openedAt).toLocaleString()}
              </dd>
            </div>
            {checkout?.email && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Customer Email
                </dt>
                <dd className="text-sm text-gray-900">{checkout.email}</dd>
              </div>
            )}
            {checkout?.totalAmount && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Cart Total
                </dt>
                <dd className="text-sm text-gray-900">
                  {checkout.currency} {checkout.totalAmount}
                </dd>
              </div>
            )}
            {recoveryCase.closedAt && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Closed</dt>
                <dd className="text-sm text-gray-900">
                  {new Date(recoveryCase.closedAt).toLocaleString()}
                  {recoveryCase.closeReason && (
                    <span className="ml-2 text-gray-500">
                      ({recoveryCase.closeReason})
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Recovery Messages
          </h2>
          {messages.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No messages scheduled yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      Step {msg.sequenceStep} — {msg.channel}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        msg.deliveryStatus === "sent"
                          ? "text-green-600"
                          : msg.deliveryStatus === "cancelled"
                            ? "text-red-500"
                            : "text-yellow-600"
                      }`}
                    >
                      {msg.deliveryStatus}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Scheduled: {new Date(msg.scheduledFor).toLocaleString()}
                    {msg.sentAt && (
                      <> · Sent: {new Date(msg.sentAt).toLocaleString()}</>
                    )}
                    {msg.openedAt && (
                      <> · Opened: {new Date(msg.openedAt).toLocaleString()}</>
                    )}
                    {msg.clickedAt && (
                      <> · Clicked: {new Date(msg.clickedAt).toLocaleString()}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
