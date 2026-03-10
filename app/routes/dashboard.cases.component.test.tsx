// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCasesByShop: vi.fn(),
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
  useSearchParams: vi.fn(),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    useSearchParams: mocks.useSearchParams,
    Link: ({ to, children, ...props }: Record<string, unknown>) =>
      React.createElement("a", { ...props, href: to }, children as React.ReactNode),
  };
});

import DashboardCases from "~/routes/dashboard.cases";

const MOCK_CASES = [
  {
    id: 1,
    caseType: "CONFIRMED_DECLINE",
    caseStatus: "MESSAGING",
    confidenceScore: 85,
    openedAt: "2026-03-10T12:00:00Z",
    checkout: { email: "john@example.com", totalAmount: "99.99", currency: "USD" },
  },
  {
    id: 2,
    caseType: "LIKELY_ABANDONMENT",
    caseStatus: "RECOVERED",
    confidenceScore: 60,
    openedAt: "2026-03-09T10:00:00Z",
    checkout: null,
  },
];

describe("DashboardCases component", () => {
  beforeEach(() => {
    mocks.useSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()]);
  });

  it("renders Recovery Cases heading", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("Recovery Cases")).toBeInTheDocument();
  });

  it("renders all filter buttons", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders empty state when no cases", () => {
    mocks.useLoaderData.mockReturnValue({ cases: [] });
    render(<DashboardCases />);
    expect(screen.getByText("No recovery cases yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Cases will appear here when declined payments/)
    ).toBeInTheDocument();
  });

  it("renders case table with header columns when cases exist", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Opened")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("renders case rows with IDs", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders case type labels", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("Confirmed Decline")).toBeInTheDocument();
    expect(screen.getByText("Likely Abandonment")).toBeInTheDocument();
  });

  it("renders customer email when available", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("renders confidence scores", () => {
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("sets status search param when clicking a filter with value", () => {
    const mockSetSearchParams = vi.fn();
    mocks.useSearchParams.mockReturnValue([new URLSearchParams(), mockSetSearchParams]);
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);

    fireEvent.click(screen.getByText("Recovered"));

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.get("status")).toBe("RECOVERED");
  });

  it("deletes status search param when clicking All filter", () => {
    const mockSetSearchParams = vi.fn();
    mocks.useSearchParams.mockReturnValue([
      new URLSearchParams("status=RECOVERED"),
      mockSetSearchParams,
    ]);
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);

    fireEvent.click(screen.getByText("All"));

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
    expect(params.has("status")).toBe(false);
  });

  it("highlights the active filter button", () => {
    mocks.useSearchParams.mockReturnValue([
      new URLSearchParams("status=RECOVERED"),
      vi.fn(),
    ]);
    mocks.useLoaderData.mockReturnValue({ cases: MOCK_CASES });
    render(<DashboardCases />);

    const recoveredBtn = screen.getByText("Recovered");
    expect(recoveredBtn.className).toContain("bg-indigo-600");

    const allBtn = screen.getByText("All");
    expect(allBtn.className).not.toContain("bg-indigo-600");
  });
});
