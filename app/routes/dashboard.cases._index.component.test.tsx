// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/recovery-case.server", () => ({
  getCasesByShop: vi.fn(),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: vi.fn(),
}));

vi.mock("~/lib/plan.server", () => ({
  getMonthlyUsageCount: vi.fn(),
  FREE_CASES_LIMIT: 100,
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
    Form: ({ children, ...props }: Record<string, unknown>) =>
      React.createElement("form", props, children as React.ReactNode),
  };
});

import DashboardCases from "~/routes/dashboard.cases._index";

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

const DEFAULT_DATA = {
  cases: MOCK_CASES,
  planTier: "FREE" as const,
  monthlyUsage: 42,
  maxCasesPerMonth: 100,
};

describe("DashboardCases component", () => {
  beforeEach(() => {
    mocks.useSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()]);
  });

  it("renders Recovery Cases heading", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("Recovery Cases")).toBeInTheDocument();
  });

  it("renders all filter buttons", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders empty state when no cases", () => {
    mocks.useLoaderData.mockReturnValue({ ...DEFAULT_DATA, cases: [] });
    render(<DashboardCases />);
    expect(screen.getByText("No recovery cases yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Cases will appear here when declined payments/)
    ).toBeInTheDocument();
  });

  it("renders case table with header columns when cases exist", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Decline Certainty")).toBeInTheDocument();
    expect(screen.getByText("Opened")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("renders case rows with IDs", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("renders case type labels", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("Confirmed Decline")).toBeInTheDocument();
    expect(screen.getByText("Likely Abandonment")).toBeInTheDocument();
  });

  it("renders customer email when available", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("renders decline certainty scores", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("sets status search param when clicking a filter with value", () => {
    const mockSetSearchParams = vi.fn();
    mocks.useSearchParams.mockReturnValue([new URLSearchParams(), mockSetSearchParams]);
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
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
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
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
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardCases />);

    const recoveredBtn = screen.getByText("Recovered");
    expect(recoveredBtn.className).toContain("bg-indigo-600");

    const allBtn = screen.getByText("All");
    expect(allBtn.className).not.toContain("bg-indigo-600");
  });

  describe("CaseLimitNudge", () => {
    it("does not render nudge for PRO users", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
        monthlyUsage: 95,
      });
      render(<DashboardCases />);
      expect(screen.queryByText(/monthly case limit/i)).not.toBeInTheDocument();
    });

    it("does not render nudge for FREE users under 70%", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 69,
      });
      render(<DashboardCases />);
      expect(screen.queryByText(/monthly case limit/i)).not.toBeInTheDocument();
    });

    it("renders approaching nudge at 70% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 70,
      });
      render(<DashboardCases />);
      expect(
        screen.getByText("Approaching your monthly case limit")
      ).toBeInTheDocument();
      expect(screen.getByText("70/100")).toBeInTheDocument();
    });

    it("renders approaching nudge at 80% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 80,
      });
      render(<DashboardCases />);
      expect(
        screen.getByText("Approaching your monthly case limit")
      ).toBeInTheDocument();
      expect(screen.getByText("80/100")).toBeInTheDocument();
    });

    it("renders urgent nudge at 90% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 90,
      });
      render(<DashboardCases />);
      expect(
        screen.getByText("Almost at your monthly case limit")
      ).toBeInTheDocument();
      expect(screen.getByText("90/100")).toBeInTheDocument();
    });

    it("renders critical nudge when limit is reached", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 100,
      });
      render(<DashboardCases />);
      expect(
        screen.getByText(
          "Monthly case limit reached — new cases are paused"
        )
      ).toBeInTheDocument();
      expect(screen.getByText("100/100")).toBeInTheDocument();
    });

    it("renders critical nudge when over limit", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 105,
      });
      render(<DashboardCases />);
      expect(
        screen.getByText(
          "Monthly case limit reached — new cases are paused"
        )
      ).toBeInTheDocument();
    });

    it("renders Upgrade to Pro link in nudge", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 85,
      });
      render(<DashboardCases />);
      const upgradeLink = screen.getByText("Upgrade to Pro →");
      expect(upgradeLink).toBeInTheDocument();
      expect(upgradeLink.closest("a")).toHaveAttribute(
        "href",
        "/dashboard/settings"
      );
    });
  });
});
