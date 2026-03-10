// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCaseById: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
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
  recoveryMessages: [],
  checkout: {
    email: "customer@example.com",
    totalAmount: "99.99",
    currency: "USD",
    recoveryUrl: "https://store.myshopify.com/checkout/recover/abc",
  },
};

describe("CaseDetail component", () => {
  it("renders case heading with ID", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("Case #42")).toBeInTheDocument();
  });

  it("renders Back to Cases link", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("← Back to Cases")).toBeInTheDocument();
  });

  it("renders status badge", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("MESSAGING")).toBeInTheDocument();
  });

  it("renders type badge with formatted label", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("CONFIRMED DECLINE")).toBeInTheDocument();
  });

  it("renders confidence score", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("Confidence: 85%")).toBeInTheDocument();
  });

  it("renders customer email from checkout", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("Customer Email")).toBeInTheDocument();
    expect(screen.getByText("customer@example.com")).toBeInTheDocument();
  });

  it("renders cart total from checkout", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("Cart Total")).toBeInTheDocument();
    expect(screen.getByText("USD 99.99")).toBeInTheDocument();
  });

  it("renders empty messages state", () => {
    mocks.useLoaderData.mockReturnValue({ recoveryCase: BASE_CASE });
    render(<CaseDetail />);
    expect(screen.getByText("No messages scheduled yet.")).toBeInTheDocument();
  });

  it("renders messages when present", () => {
    const caseWithMessages = {
      ...BASE_CASE,
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
        },
      ],
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: caseWithMessages });
    render(<CaseDetail />);
    expect(screen.getByText(/Step 1 — EMAIL/)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 — SMS/)).toBeInTheDocument();
    expect(screen.getByText("sent")).toBeInTheDocument();
    expect(screen.getByText("scheduled")).toBeInTheDocument();
  });

  it("renders closed case info with close reason", () => {
    const closedCase = {
      ...BASE_CASE,
      caseStatus: "RECOVERED",
      closedAt: "2026-03-11T08:00:00Z",
      closeReason: "order_paid",
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: closedCase });
    render(<CaseDetail />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("(order_paid)")).toBeInTheDocument();
  });

  it("renders RECOVERED status with green styling", () => {
    const recoveredCase = { ...BASE_CASE, caseStatus: "RECOVERED" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: recoveredCase });
    render(<CaseDetail />);
    const badge = screen.getByText("RECOVERED");
    expect(badge.className).toContain("bg-green-100");
  });

  it("renders CANDIDATE status with yellow styling", () => {
    const candidateCase = { ...BASE_CASE, caseStatus: "CANDIDATE" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: candidateCase });
    render(<CaseDetail />);
    const badge = screen.getByText("CANDIDATE");
    expect(badge.className).toContain("bg-yellow-100");
  });

  it("hides email section when checkout has no email", () => {
    const noEmailCase = {
      ...BASE_CASE,
      checkout: { ...BASE_CASE.checkout, email: undefined },
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: noEmailCase });
    render(<CaseDetail />);
    expect(screen.queryByText("Customer Email")).not.toBeInTheDocument();
  });

  it("renders message with clickedAt timestamp", () => {
    const caseWithClick = {
      ...BASE_CASE,
      recoveryMessages: [
        {
          id: 1,
          sequenceStep: 1,
          channel: "EMAIL",
          scheduledFor: "2026-03-10T12:15:00Z",
          sentAt: "2026-03-10T12:15:05Z",
          deliveryStatus: "sent",
          openedAt: "2026-03-10T13:00:00Z",
          clickedAt: "2026-03-10T14:00:00Z",
        },
      ],
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: caseWithClick });
    render(<CaseDetail />);
    expect(screen.getByText(/Clicked:/)).toBeInTheDocument();
  });

  it("renders cancelled message delivery status in red", () => {
    const caseWithCancelled = {
      ...BASE_CASE,
      recoveryMessages: [
        {
          id: 1,
          sequenceStep: 1,
          channel: "EMAIL",
          scheduledFor: "2026-03-10T12:15:00Z",
          sentAt: null,
          deliveryStatus: "cancelled",
          openedAt: null,
          clickedAt: null,
        },
      ],
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: caseWithCancelled });
    render(<CaseDetail />);
    const status = screen.getByText("cancelled");
    expect(status.className).toContain("text-red-500");
  });

  it("renders SUPPRESSED status with gray fallback styling", () => {
    const suppressedCase = { ...BASE_CASE, caseStatus: "SUPPRESSED" };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: suppressedCase });
    render(<CaseDetail />);
    const badge = screen.getByText("SUPPRESSED");
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).toContain("text-gray-700");
  });

  it("hides email and cart total when checkout is null", () => {
    const nullCheckoutCase = {
      ...BASE_CASE,
      checkout: null,
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: nullCheckoutCase });
    render(<CaseDetail />);
    expect(screen.queryByText("Customer Email")).not.toBeInTheDocument();
    expect(screen.queryByText("Cart Total")).not.toBeInTheDocument();
  });

  it("hides cart total when checkout has no totalAmount", () => {
    const noAmountCase = {
      ...BASE_CASE,
      checkout: { ...BASE_CASE.checkout, totalAmount: undefined },
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: noAmountCase });
    render(<CaseDetail />);
    expect(screen.queryByText("Cart Total")).not.toBeInTheDocument();
    expect(screen.getByText("Customer Email")).toBeInTheDocument();
  });

  it("renders closed case without close reason", () => {
    const closedNoReason = {
      ...BASE_CASE,
      caseStatus: "EXPIRED",
      closedAt: "2026-03-11T08:00:00Z",
      closeReason: null,
    };
    mocks.useLoaderData.mockReturnValue({ recoveryCase: closedNoReason });
    render(<CaseDetail />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });
});
