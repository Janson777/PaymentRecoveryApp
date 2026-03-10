// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/lib/db.server", () => ({
  prisma: {},
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
  return {
    useLoaderData: mocks.useLoaderData,
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
});
