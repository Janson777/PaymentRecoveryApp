import React, { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { requireShopId } from "~/lib/session.server";
import { getCaseById, transitionCaseStatus } from "~/models/recovery-case.server";
import { cancelPendingMessages } from "~/models/recovery-message.server";
import { getSignalsForCheckout } from "~/models/payment-signal.server";
import { getOptOutRecord } from "~/models/sms-opt-out.server";
import { CaseStatus } from "@prisma/client";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);
  const caseId = Number(params.id);

  if (isNaN(caseId)) {
    throw new Response("Invalid case ID", { status: 400 });
  }

  const recoveryCase = await getCaseById(caseId);
  if (!recoveryCase || recoveryCase.shopId !== shopId) {
    throw new Response("Case not found", { status: 404 });
  }

  const paymentSignals = recoveryCase.checkoutId
    ? (await getSignalsForCheckout(recoveryCase.checkoutId)).reverse()
    : [];

  const checkout = (recoveryCase as Record<string, unknown>).checkout as
    | { phone?: string | null }
    | null;
  const smsOptOut = checkout?.phone
    ? await getOptOutRecord(checkout.phone)
    : null;

  return json({
    recoveryCase,
    paymentSignals,
    smsOptOut: smsOptOut
      ? { phone: smsOptOut.phone, optedOutAt: smsOptOut.optedOutAt.toISOString() }
      : null,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const shopId = await requireShopId(request);
  const caseId = Number(params.id);

  if (isNaN(caseId)) {
    throw new Response("Invalid case ID", { status: 400 });
  }

  const recoveryCase = await getCaseById(caseId);
  if (!recoveryCase || recoveryCase.shopId !== shopId) {
    throw new Response("Case not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    await cancelPendingMessages(caseId);
    await transitionCaseStatus(caseId, CaseStatus.CANCELLED, "merchant_cancelled");
    return redirect(`/dashboard/cases/${caseId}`);
  }

  throw new Response("Unknown action", { status: 400 });
}

/* ── Color constants ──────────────────────────────────────────────────────── */

const AMBER = "#FFC107";
const INDIGO = "#5C6BC0";
const GREEN = "#4CAF50";
const LIGHT_GREEN = "#81C784";
const RED = "#E53935";
const GREY = "#E0E0E0";
const DARK_GREY = "#D3D3D3";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  CANDIDATE: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  READY: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-400" },
  MESSAGING: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-400" },
  RECOVERED: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  SUPPRESSED: { bg: "bg-slate-50", text: "text-slate-600", dot: "bg-slate-400" },
  EXPIRED: { bg: "bg-stone-50", text: "text-stone-600", dot: "bg-stone-400" },
  CANCELLED: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
};

const SIGNAL_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  TRANSACTION_FAILURE: { icon: "✕", color: "text-red-500 bg-red-50 border-red-200", label: "Payment Failed" },
  TRANSACTION_ERROR: { icon: "⚠", color: "text-amber-500 bg-amber-50 border-amber-200", label: "Transaction Error" },
  TRANSACTION_SUCCESS: { icon: "✓", color: "text-emerald-500 bg-emerald-50 border-emerald-200", label: "Payment Succeeded" },
  ORDER_CREATED: { icon: "📦", color: "text-blue-500 bg-blue-50 border-blue-200", label: "Order Created" },
  ORDER_PAID: { icon: "💰", color: "text-emerald-500 bg-emerald-50 border-emerald-200", label: "Order Paid" },
  ORDER_CANCELLED: { icon: "✕", color: "text-red-500 bg-red-50 border-red-200", label: "Order Cancelled" },
  LIKELY_LATE_STAGE_ABANDONMENT: { icon: "⏱", color: "text-amber-500 bg-amber-50 border-amber-200", label: "Late-Stage Abandonment" },
};

/* ── Utility functions ────────────────────────────────────────────────────── */

function formatErrorCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins} Min.`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (remainMins === 0) return `${hours} Hr.`;
  return `${hours} Hr. ${remainMins} Min.`;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ── Types ────────────────────────────────────────────────────────────────── */

interface PlannedStep {
  channel: "EMAIL" | "SMS";
  delayMinutes: number;
}

interface RecoveryMessageData {
  id: number;
  sequenceStep: number;
  channel: string;
  scheduledFor: string;
  sentAt: string | null;
  deliveryStatus: string;
  openedAt: string | null;
  clickedAt: string | null;
  checkoutCompletedAfterClickAt: string | null;
}

interface CheckoutData {
  email?: string;
  phone?: string;
  totalAmount?: string;
  currency?: string;
  recoveryUrl?: string;
  shopifyCheckoutId?: string;
}

interface MainNode {
  id: string;
  label: string;
  type: "decline" | "message" | "outcome";
  colorHex: string;
  isActive: boolean;
  isClickable: boolean;
  hasCheckmark: boolean;
  timestamp?: string;
  messageData?: RecoveryMessageData;
}

interface SubNode {
  label: string;
  colorHex: string;
  isDone: boolean;
  timestamp?: string | null;
  showCheckmark?: boolean;
}

/* ── Checkmark SVG ────────────────────────────────────────────────────────── */

function CheckmarkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={3.5}
      stroke="white"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function CaseDetail() {
  const { recoveryCase, paymentSignals, smsOptOut } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showUrl) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowUrl(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUrl]);

  const messages = (
    recoveryCase as Record<string, unknown>
  ).recoveryMessages as RecoveryMessageData[];
  const checkout = (
    recoveryCase as Record<string, unknown>
  ).checkout as CheckoutData | null;

  const statusStyle =
    STATUS_CONFIG[recoveryCase.caseStatus] ?? STATUS_CONFIG.EXPIRED;
  const isOpen = ["CANDIDATE", "READY", "MESSAGING"].includes(
    recoveryCase.caseStatus
  );
  const isClosed = ["RECOVERED", "SUPPRESSED", "EXPIRED", "CANCELLED"].includes(
    recoveryCase.caseStatus
  );
  const isCancelling = fetcher.state !== "idle";

  /* ── Build planned sequence ─────────────────────────────────────────────── */

  const rawPlanned = recoveryCase.plannedSequenceJson as PlannedStep[] | null;
  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );

  const plannedSteps: PlannedStep[] = rawPlanned
    ? rawPlanned
    : sortedMessages.map((m) => ({
        channel: m.channel as "EMAIL" | "SMS",
        delayMinutes: 0,
      }));

  /* ── Build main timeline nodes ──────────────────────────────────────────── */

  const mainNodes: MainNode[] = [];

  mainNodes.push({
    id: "decline",
    label: "Decline detected",
    type: "decline",
    colorHex: AMBER,
    isActive: true,
    isClickable: true,
    hasCheckmark: false,
    timestamp: recoveryCase.openedAt,
  });

  let emailCount = 0;
  let smsCount = 0;

  plannedSteps.forEach((step, i) => {
    const isEmail = step.channel === "EMAIL";
    if (isEmail) emailCount++;
    else smsCount++;

    const label = isEmail ? `Email ${emailCount}` : `SMS ${smsCount}`;
    const matchingMsg = sortedMessages.find(
      (m) => m.sequenceStep === i + 1
    );
    const hasBeenReached = !!matchingMsg;

    mainNodes.push({
      id: `msg-${i}`,
      label,
      type: "message",
      colorHex: hasBeenReached ? INDIGO : GREY,
      isActive: hasBeenReached,
      isClickable: hasBeenReached,
      hasCheckmark: false,
      timestamp: matchingMsg?.scheduledFor,
      messageData: matchingMsg,
    });
  });

  const outcomeConfig: Record<string, { label: string; color: string }> = {
    RECOVERED: { label: "Recovered", color: GREEN },
    EXPIRED: { label: "Expired", color: DARK_GREY },
    CANCELLED: { label: "Cancelled", color: RED },
    SUPPRESSED: { label: "Suppressed", color: DARK_GREY },
  };
  const outcome = outcomeConfig[recoveryCase.caseStatus];

  mainNodes.push({
    id: "outcome",
    label: outcome?.label ?? "Recovered",
    type: "outcome",
    colorHex: outcome?.color ?? GREY,
    isActive: isClosed,
    isClickable: false,
    hasCheckmark: true,
    timestamp: recoveryCase.closedAt ?? undefined,
  });

  /* ── Default selected node: most recently active message, else decline ── */

  const lastActiveMessageIndex = (() => {
    for (let i = mainNodes.length - 1; i >= 0; i--) {
      if (mainNodes[i].type === "message" && mainNodes[i].isActive) return i;
    }
    return -1;
  })();

  const defaultSelectedId =
    lastActiveMessageIndex >= 0
      ? mainNodes[lastActiveMessageIndex].id
      : "decline";

  const [selectedNodeId, setSelectedNodeId] = useState(defaultSelectedId);
  const selectedIndex = mainNodes.findIndex((n) => n.id === selectedNodeId);
  const selectedNode = mainNodes[selectedIndex];
  const nodeCount = mainNodes.length;

  /* ── Grid-based positioning calculations ────────────────────────────────── */

  const edgePct = 100 / (2 * nodeCount);
  const leaderPct = (selectedIndex + 0.5) / nodeCount * 100;
  const leaderColor = selectedNode?.type === "decline" ? AMBER : INDIGO;

  /* ── Build sub-timeline nodes for selected main node ────────────────────── */

  function getSubNodes(): SubNode[] {
    if (!selectedNode) return [];

    if (selectedNode.type === "decline") {
      if (!recoveryCase.suppressionUntil) {
        return [
          {
            label: "Decline detected",
            colorHex: AMBER,
            isDone: true,
            timestamp: recoveryCase.openedAt,
          },
        ];
      }
      const isPast =
        Date.now() >= new Date(recoveryCase.suppressionUntil).getTime();
      return [
        {
          label: "Delay\ninitiated",
          colorHex: AMBER,
          isDone: true,
          timestamp: recoveryCase.openedAt,
        },
        {
          label: "Delay\ncomplete",
          colorHex: isPast ? AMBER : GREY,
          isDone: isPast,
          timestamp: recoveryCase.suppressionUntil,
        },
      ];
    }

    if (selectedNode.type === "message" && selectedNode.messageData) {
      const msg = selectedNode.messageData;

      if (msg.deliveryStatus === "cancelled") {
        return [
          {
            label: "Scheduled",
            colorHex: INDIGO,
            isDone: true,
            timestamp: msg.scheduledFor,
          },
          {
            label: "Cancelled",
            colorHex: RED,
            isDone: true,
            timestamp: null,
          },
        ];
      }

      const isSms = msg.channel === "SMS";
      const stopReceived =
        isSms &&
        smsOptOut &&
        msg.sentAt &&
        new Date(smsOptOut.optedOutAt).getTime() >=
          new Date(msg.sentAt).getTime();

      const nodes: SubNode[] = [
        {
          label: "Scheduled",
          colorHex: INDIGO,
          isDone: true,
          timestamp: msg.scheduledFor,
        },
        {
          label: "Sent",
          colorHex: msg.sentAt ? INDIGO : GREY,
          isDone: !!msg.sentAt,
          timestamp: msg.sentAt,
        },
        {
          label: "Opened",
          colorHex: msg.openedAt ? INDIGO : GREY,
          isDone: !!msg.openedAt,
          timestamp: msg.openedAt,
        },
        {
          label: "Clicked",
          colorHex: msg.clickedAt ? LIGHT_GREEN : GREY,
          isDone: !!msg.clickedAt,
          timestamp: msg.clickedAt,
        },
      ];

      if (stopReceived) {
        nodes.push({
          label: "STOP received",
          colorHex: RED,
          isDone: true,
          showCheckmark: false,
          timestamp: smsOptOut.optedOutAt,
        });
      } else {
        nodes.push({
          label: "Completed",
          colorHex: msg.checkoutCompletedAfterClickAt ? GREEN : GREY,
          isDone: !!msg.checkoutCompletedAfterClickAt,
          timestamp: msg.checkoutCompletedAfterClickAt,
        });
      }

      return nodes;
    }

    return [];
  }

  const subNodes = getSubNodes();
  const hasSubTimeline = subNodes.length > 0;
  const isDeclineSelected = selectedNode?.type === "decline";

  const suppressionDuration =
    isDeclineSelected && recoveryCase.suppressionUntil
      ? formatDuration(
          new Date(recoveryCase.openedAt).getTime(),
          new Date(recoveryCase.suppressionUntil).getTime()
        )
      : null;

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-6xl">
      <style>{`
        @keyframes timeline-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>

      {/* Back link */}
      <Link
        to="/dashboard/cases"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-600"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to Cases
      </Link>

      {/* ═══ Header ═══ */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Case #{recoveryCase.id}
            </h1>
            {checkout?.recoveryUrl && (
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setShowUrl(!showUrl)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                >
                  Recovery URL
                </button>
                {showUrl && (
                  <div className="absolute left-0 top-full z-20 mt-1.5 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                      Recovery URL
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={checkout.recoveryUrl}
                        className="flex-1 truncate rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-xs text-gray-600 focus:outline-none"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(checkout.recoveryUrl!)
                            .then(() => {
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            });
                        }}
                        className={`flex-shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                          copied
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        }`}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`}
              />
              {recoveryCase.caseStatus}
            </span>
            <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
              {recoveryCase.caseType.replace("_", " ")}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              {recoveryCase.confidenceScore}% decline certainty
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOpen && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <button
                type="submit"
                disabled={isCancelling}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50 hover:shadow disabled:opacity-50"
                onClick={(e) => {
                  if (
                    !confirm(
                      "Cancel this recovery case? Pending messages will be cancelled."
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                {isCancelling ? "Cancelling…" : "Cancel Case"}
              </button>
            </fetcher.Form>
          )}
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Cart Total
          </p>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-900">
            {checkout?.totalAmount
              ? `${checkout.currency ?? "USD"} $${Number(checkout.totalAmount).toFixed(2)}`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Customer
          </p>
          <p className="mt-1.5 truncate text-sm font-medium text-gray-900">
            {checkout?.email ?? "Unknown"}
          </p>
          {checkout?.phone && (
            <p className="mt-0.5 text-xs text-gray-500">{checkout.phone}</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Opened
          </p>
          <p className="mt-1.5 text-sm font-medium text-gray-900">
            {new Date(recoveryCase.openedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {timeAgo(recoveryCase.openedAt)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Decline Reason
          </p>
          <p className="mt-1.5 text-sm font-medium text-gray-900">
            {recoveryCase.primaryReasonCode
              ? formatErrorCode(recoveryCase.primaryReasonCode)
              : "—"}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CASE TIMELINE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 pb-8">
        <h2 className="mb-8 text-lg font-semibold text-gray-900">
          Case Timeline
        </h2>

        {/* ── Main horizontal timeline ────────────────────────────────────── */}
        <div className="relative">
          {/* Connecting line — spans between first and last node centers */}
          <div
            className="absolute h-[2px]"
            style={{
              left: `${edgePct}%`,
              right: `${edgePct}%`,
              top: "20px",
              backgroundColor: GREY,
            }}
          />

          {/* Nodes — CSS grid for accurate, evenly-spaced columns */}
          <div
            className="relative"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${nodeCount}, 1fr)`,
            }}
          >
            {mainNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;

              return (
                <div
                  key={node.id}
                  className="flex flex-col items-center"
                >
                  {/* Dot */}
                  <button
                    type="button"
                    disabled={!node.isClickable}
                    onClick={() =>
                      node.isClickable && setSelectedNodeId(node.id)
                    }
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                      node.isClickable
                        ? "cursor-pointer hover:brightness-110"
                        : "cursor-default"
                    }`}
                    style={{
                      backgroundColor: node.isActive
                        ? node.colorHex
                        : node.hasCheckmark ? DARK_GREY : GREY,
                    }}
                  >
                    {isSelected && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          backgroundColor: node.isActive
                            ? node.colorHex
                            : GREY,
                          animation:
                            "timeline-pulse 1s ease-in-out infinite",
                        }}
                      />
                    )}

                    {node.hasCheckmark && (
                      <CheckmarkIcon size={16} />
                    )}
                  </button>

                  {/* Label */}
                  <p
                    className={`mt-2 text-center text-xs font-medium ${
                      isSelected || node.isActive
                        ? "text-gray-900"
                        : "text-gray-400"
                    }`}
                  >
                    {node.label}
                  </p>

                  {/* Timestamp */}
                  {node.timestamp ? (
                    <p className="mt-0.5 text-center text-[10px] text-gray-400">
                      {formatShortDate(node.timestamp)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-center text-[10px] text-transparent select-none">
                      —
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Leader line + Sub-timeline ──────────────────────────────────── */}
        {hasSubTimeline && (
          <div className="relative mt-1">
            {/* Leader line: vertical drop from selected node center */}
            <div
              className="absolute z-10 transition-all duration-300"
              style={{
                left: `${leaderPct}%`,
                transform: "translateX(-50%)",
                top: 0,
                width: "3px",
                height: "28px",
                backgroundColor: leaderColor,
                borderRadius: "2px",
              }}
            />

            {/* Sub-timeline container — gap between leader line and box */}
            <div
              className="pt-[36px]"
              style={{
                display: "flex",
                justifyContent: isDeclineSelected
                  ? "flex-start"
                  : "center",
              }}
            >
              <div
                className="relative rounded-xl bg-white px-8 py-5"
                style={{
                  border: `2px solid ${leaderColor}`,
                  minWidth: isDeclineSelected ? "408px" : "628px",
                  maxWidth: "100%",
                }}
              >
                {/* Sub-timeline nodes — CSS grid for accurate gap positioning */}
                <div
                  className="relative"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${subNodes.length}, 1fr)`,
                  }}
                >
                  {/* Individual line segments between consecutive sub-nodes (with gaps) */}
                  {subNodes.map((_, i) => {
                    if (i >= subNodes.length - 1) return null;
                    const count = subNodes.length;
                    const leftPct = ((i + 0.5) / count) * 100;
                    const rightPct = ((count - i - 1.5) / count) * 100;
                    return (
                      <div
                        key={`seg-${i}`}
                        className="absolute h-[2px]"
                        style={{
                          left: `calc(${leftPct}% + 24px)`,
                          right: `calc(${rightPct}% + 24px)`,
                          top: "14px",
                          backgroundColor: GREY,
                        }}
                      />
                    );
                  })}

                  {/* Duration label above connecting line (suppression window) */}
                  {suppressionDuration && subNodes.length > 1 && (
                    <div
                      className="absolute left-0 right-0 flex justify-center"
                      style={{ top: "-2px" }}
                    >
                      <span className="rounded bg-white px-2 text-[10px] font-medium text-gray-500">
                        {suppressionDuration} duration
                      </span>
                    </div>
                  )}

                  {subNodes.map((sub) => (
                    <div
                      key={sub.label}
                      className="relative z-10 flex flex-col items-center"
                    >
                      {/* Sub-node dot */}
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={
                          sub.isDone
                            ? { backgroundColor: sub.colorHex }
                            : {
                                backgroundColor: "white",
                                border: `2px solid ${GREY}`,
                              }
                        }
                      >
                        {sub.isDone && sub.showCheckmark !== false && (
                          <CheckmarkIcon size={12} />
                        )}
                      </div>

                      {/* Sub-node label */}
                      <p
                        className={`mt-1.5 whitespace-pre-line text-center text-[11px] font-medium leading-tight ${
                          sub.isDone ? "text-gray-800" : "text-gray-400"
                        }`}
                      >
                        {sub.label}
                      </p>

                      {/* Sub-node timestamp */}
                      {sub.timestamp ? (
                        <p className="mt-0.5 whitespace-nowrap text-center text-[10px] text-gray-400">
                          {formatDateTime(sub.timestamp)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAYMENT SIGNALS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">
            Payment Signals
          </h2>
        </div>

        {paymentSignals.length === 0 ? (
          <p className="mt-6 text-center text-sm italic text-gray-400">
            No payment signals recorded.
          </p>
        ) : (
          <div className="relative mt-6">
            <div className="absolute left-4 top-2 h-[calc(100%-16px)] w-px bg-gray-200" />
            <div className="space-y-5">
              {paymentSignals.map((signal) => {
                const config =
                  SIGNAL_CONFIG[signal.signalType] ??
                  SIGNAL_CONFIG.TRANSACTION_ERROR;
                return (
                  <div
                    key={signal.id}
                    className="relative flex gap-4 pl-1"
                  >
                    <div
                      className={`relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs ${config.color}`}
                    >
                      {config.icon}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {config.label}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                        {signal.errorCode && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600">
                            {signal.errorCode}
                          </span>
                        )}
                        {signal.paymentMethodSummary && (
                          <span>{signal.paymentMethodSummary}</span>
                        )}
                        {signal.gateway && (
                          <span className="text-gray-400">
                            via {signal.gateway.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                        {signal.amount && (
                          <span className="font-medium tabular-nums text-gray-600">
                            {signal.currency ?? "USD"} $
                            {Number(signal.amount).toFixed(2)}
                          </span>
                        )}
                        <span>·</span>
                        <span>
                          {new Date(signal.occurredAt).toLocaleString()}
                        </span>
                        <span className="text-gray-300">
                          ({timeAgo(signal.occurredAt)})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
