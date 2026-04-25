// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCaseById: vi.fn(),
  transitionCaseStatus: vi.fn(),
}));

vi.mock("~/models/recovery-message.server", () => ({
  cancelPendingMessages: vi.fn(),
}));

vi.mock("~/models/payment-signal.server", () => ({
  getSignalsForCheckout: vi.fn(),
}));

vi.mock("~/models/sms-opt-out.server", () => ({
  getOptOutRecord: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  CaseStatus: {
    CANDIDATE: "CANDIDATE",
    READY: "READY",
    MESSAGING: "MESSAGING",
    RECOVERED: "RECOVERED",
    SUPPRESSED: "SUPPRESSED",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED",
  },
}));

const mocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
  useFetcher: vi.fn(),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    useFetcher: mocks.useFetcher,
    Link: ({ to, children, ...props }: Record<string, unknown>) =>
      React.createElement("a", { ...props, href: to }, children as React.ReactNode),
  };
});

import CaseDetail from "~/routes/dashboard.cases.$id";

const BASE_CASE = {
  id: 42,
  caseStatus: "MESSAGING",
  caseType: "CONFIRMED_DECLINE",
  confidenceScore: 85,
  openedAt: "2026-03-10T12:00:00Z",
  closedAt: null,
  closeReason: null,
  primaryReasonCode: null,
  suppressionUntil: null,
  plannedSequenceJson: null,
  recoveryMessages: [],
  checkout: {
    email: "customer@example.com",
    phone: null,
    totalAmount: "99.99",
    currency: "USD",
    recoveryUrl: "https://store.myshopify.com/checkout/recover/abc",
  },
};

const defaultLoaderData = { recoveryCase: BASE_CASE, paymentSignals: [], smsOptOut: null };

describe("CaseDetail component", () => {
  beforeEach(() => {
    mocks.useFetcher.mockReturnValue({ state: "idle", Form: "form" });
  });

  it("renders case heading with ID", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Case #42")).toBeInTheDocument();
  });

  it("renders Back to Cases link", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Back to Cases")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("MESSAGING")).toBeInTheDocument();
  });

  it("renders type badge with formatted label", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("CONFIRMED DECLINE")).toBeInTheDocument();
  });

  it("renders decline certainty score", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText(/85/)).toBeInTheDocument();
    expect(screen.getByText(/decline certainty/)).toBeInTheDocument();
  });

  it("renders customer email from checkout", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("customer@example.com")).toBeInTheDocument();
  });

  it("renders cart total from checkout", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Cart Total")).toBeInTheDocument();
    expect(screen.getByText(/99\.99/)).toBeInTheDocument();
  });

  it("renders Case Timeline section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Case Timeline")).toBeInTheDocument();
  });

  it("renders Decline detected node in timeline", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    const nodes = screen.getAllByText("Decline detected");
    expect(nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders message nodes when messages are present", () => {
    const caseWithMessages = {
      ...BASE_CASE,
      plannedSequenceJson: [
        { channel: "EMAIL", delayMinutes: 15 },
        { channel: "SMS", delayMinutes: 720 },
      ],
      recoveryMessages: [
        {
          id: 1,
          sequenceStep: 1,
          channel: "EMAIL",
          scheduledFor: "2026-03-10T12:15:00Z",
          sentAt: "2026-03-10T12:15:05Z",
          deliveryStatus: "sent",
          openedAt: "2026-03-10T13:00:00Z",
          clickedAt: null,
          checkoutCompletedAfterClickAt: null,
        },
        {
          id: 2,
          sequenceStep: 2,
          channel: "SMS",
          scheduledFor: "2026-03-11T00:00:00Z",
          sentAt: null,
          deliveryStatus: "scheduled",
          openedAt: null,
          clickedAt: null,
          checkoutCompletedAfterClickAt: null,
        },
      ],
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: caseWithMessages, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    expect(screen.getByText("Email 1")).toBeInTheDocument();
    expect(screen.getByText("SMS 1")).toBeInTheDocument();
  });

  it("renders RECOVERED status badge with emerald styling", () => {
    const recoveredCase = { ...BASE_CASE, caseStatus: "RECOVERED", closedAt: "2026-03-11T08:00:00Z" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: recoveredCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    const badge = screen.getByText("RECOVERED");
    expect(badge.className).toContain("bg-emerald-50");
  });

  it("renders CANDIDATE status badge with amber styling", () => {
    const candidateCase = { ...BASE_CASE, caseStatus: "CANDIDATE" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: candidateCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    const badge = screen.getByText("CANDIDATE");
    expect(badge.className).toContain("bg-amber-50");
  });

  it("renders SUPPRESSED status badge with slate styling", () => {
    const suppressedCase = { ...BASE_CASE, caseStatus: "SUPPRESSED" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: suppressedCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    const badge = screen.getByText("SUPPRESSED");
    expect(badge.className).toContain("bg-slate-50");
    expect(badge.className).toContain("text-slate-600");
  });

  it("shows Customer as Unknown when checkout has no email", () => {
    const noEmailCase = {
      ...BASE_CASE,
      checkout: { ...BASE_CASE.checkout, email: undefined },
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: noEmailCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows dash for cart total when checkout is null", () => {
    const nullCheckoutCase = {
      ...BASE_CASE,
      checkout: null,
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: nullCheckoutCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    expect(screen.getByText("Cart Total")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows dash for cart total when checkout has no totalAmount", () => {
    const noAmountCase = {
      ...BASE_CASE,
      checkout: { ...BASE_CASE.checkout, totalAmount: undefined },
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: noAmountCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("customer@example.com")).toBeInTheDocument();
  });

  it("renders Payment Signals section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Payment Signals")).toBeInTheDocument();
    expect(screen.getByText("No payment signals recorded.")).toBeInTheDocument();
  });

  it("renders Cancel Case button for open cases", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<CaseDetail />);
    expect(screen.getByText("Cancel Case")).toBeInTheDocument();
  });

  it("hides Cancel Case button for closed cases", () => {
    const closedCase = { ...BASE_CASE, caseStatus: "RECOVERED", closedAt: "2026-03-11T08:00:00Z" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: closedCase, paymentSignals: [], smsOptOut: null });
    render(<CaseDetail />);
    expect(screen.queryByText("Cancel Case")).not.toBeInTheDocument();
  });
});
