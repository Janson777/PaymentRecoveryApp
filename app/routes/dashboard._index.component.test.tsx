// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/lib/db.server", () => ({
  prisma: {},
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
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    Link: ({ to, children, ...props }: Record<string, unknown>) =>
      React.createElement(
        "a",
        { ...props, href: to },
        children as React.ReactNode
      ),
  };
});

import DashboardIndex from "~/routes/dashboard._index";

const DEFAULT_DATA = {
  totalCases: 100,
  recoveredCases: 25,
  activeCases: 30,
  messagesSent: 75,
  recoveryRate: 25,
  recoveredRevenue: 5000,
  currency: "USD",
  casesMessaged: 50,
  casesClicked: 20,
  planTier: "FREE" as const,
  monthlyUsage: 42,
  maxCasesPerMonth: 100,
  smsEnabled: false,
  shopDomain: "test-shop.myshopify.com",
};

describe("DashboardIndex component", () => {
  it("renders Overview heading", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("renders recovery rate metric", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Recovery Rate")).toBeInTheDocument();
    // "25%" appears in both the MetricCard value and RecoveryFunnel percentage
    const rateMatches = screen.getAllByText(/25%/);
    expect(rateMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders recovered revenue with currency formatting", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Recovered Revenue")).toBeInTheDocument();
    expect(screen.getByText("$5,000")).toBeInTheDocument();
  });

  it("renders recovered orders count", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Recovered Orders")).toBeInTheDocument();
    // "25" appears in both the MetricCard and RecoveryFunnel
    const orderMatches = screen.getAllByText("25");
    expect(orderMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders active cases count", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Active Cases")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders messages sent count", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    // "Messages Sent" appears in both MetricCard title and RecoveryFunnel label
    const sentMatches = screen.getAllByText("Messages Sent");
    expect(sentMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("renders Recovery Funnel section", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Recovery Funnel")).toBeInTheDocument();
  });

  it("renders funnel with stage labels when data exists", () => {
    mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
    render(<DashboardIndex />);
    expect(screen.getByText("Declined Payments")).toBeInTheDocument();
    // "Messages Sent" appears in both MetricCard and funnel
    expect(screen.getAllByText("Messages Sent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Links Clicked")).toBeInTheDocument();
    expect(screen.getByText("Orders Recovered")).toBeInTheDocument();
  });

  it("renders funnel placeholder when no data", () => {
    mocks.useLoaderData.mockReturnValue({
      ...DEFAULT_DATA,
      totalCases: 0,
      recoveredCases: 0,
      activeCases: 0,
      messagesSent: 0,
      casesMessaged: 0,
      casesClicked: 0,
    });
    render(<DashboardIndex />);
    expect(
      screen.getByText(/Funnel visualization will appear/)
    ).toBeInTheDocument();
  });

  it("formats EUR currency correctly", () => {
    mocks.useLoaderData.mockReturnValue({
      ...DEFAULT_DATA,
      recoveredRevenue: 12345,
      currency: "EUR",
    });
    render(<DashboardIndex />);
    expect(screen.getByText("€12,345")).toBeInTheDocument();
  });

  describe("analytics upgrade nudge", () => {
    it("renders upgrade nudge for FREE users", () => {
      mocks.useLoaderData.mockReturnValue(DEFAULT_DATA);
      render(<DashboardIndex />);
      expect(
        screen.getByText("Unlock advanced analytics with Pro")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Unlock advanced analytics with Pro").closest("a")
      ).toHaveAttribute("href", "/dashboard/settings");
    });

    it("hides upgrade nudge for PRO users", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
      });
      render(<DashboardIndex />);
      expect(
        screen.queryByText("Unlock advanced analytics with Pro")
      ).not.toBeInTheDocument();
    });
  });

  describe("UsageLimitBanner", () => {
    it("does not render banner for PRO users", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
        monthlyUsage: 95,
      });
      render(<DashboardIndex />);
      expect(screen.queryByText(/monthly limit/i)).not.toBeInTheDocument();
    });

    it("does not render banner for FREE users under 70% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 69,
      });
      render(<DashboardIndex />);
      expect(screen.queryByText(/monthly limit/i)).not.toBeInTheDocument();
    });

    it("renders warning banner at 70% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 70,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(/Approaching your monthly limit/)
      ).toBeInTheDocument();
      expect(screen.getByText("70 / 100 cases this month")).toBeInTheDocument();
    });

    it("renders warning banner with amber styling at 75% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 75,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(/Approaching your monthly limit — 75 of 100/)
      ).toBeInTheDocument();
    });

    it("renders urgent banner at 90% usage", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 90,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(/Almost at your monthly limit/)
      ).toBeInTheDocument();
      expect(screen.getByText("90 / 100 cases this month")).toBeInTheDocument();
    });

    it("renders critical banner when limit is reached", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 100,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(
          "Monthly limit reached — new recovery cases are paused"
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText("100 / 100 cases this month")
      ).toBeInTheDocument();
    });

    it("renders critical banner when over limit", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 105,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(
          "Monthly limit reached — new recovery cases are paused"
        )
      ).toBeInTheDocument();
    });

    it("renders Upgrade to Pro link in banner", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        monthlyUsage: 85,
      });
      render(<DashboardIndex />);
      const upgradeLink = screen.getByText("Upgrade to Pro");
      expect(upgradeLink).toBeInTheDocument();
      expect(upgradeLink.closest("a")).toHaveAttribute(
        "href",
        "/dashboard/settings"
      );
    });
  });

  describe("DashboardPhoneReminder", () => {
    it("does not render reminder for FREE users even when smsEnabled is true", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "FREE",
        smsEnabled: true,
      });
      render(<DashboardIndex />);
      expect(
        screen.queryByText(/SMS recovery is on/)
      ).not.toBeInTheDocument();
    });

    it("does not render reminder for PRO users when smsEnabled is false", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
        smsEnabled: false,
      });
      render(<DashboardIndex />);
      expect(
        screen.queryByText(/SMS recovery is on/)
      ).not.toBeInTheDocument();
    });

    it("renders reminder for PRO users with smsEnabled=true", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
        smsEnabled: true,
      });
      render(<DashboardIndex />);
      expect(
        screen.getByText(
          /SMS recovery is on \u2014 make sure checkout collects phone numbers/
        )
      ).toBeInTheDocument();
    });

    it("links to the merchant's Shopify checkout settings in a new tab", () => {
      mocks.useLoaderData.mockReturnValue({
        ...DEFAULT_DATA,
        planTier: "PRO",
        smsEnabled: true,
        shopDomain: "acme.myshopify.com",
      });
      render(<DashboardIndex />);
      const link = screen.getByText("Open checkout settings").closest("a");
      expect(link).toHaveAttribute(
        "href",
        "https://acme.myshopify.com/admin/settings/checkout"
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
