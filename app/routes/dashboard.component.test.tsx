// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  useLoaderData: vi.fn().mockReturnValue({ shopDomain: "test-store.myshopify.com", planTier: "FREE" }),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    Outlet: () => React.createElement("div", { "data-testid": "outlet" }, "Outlet Content"),
    NavLink: ({ to, children, className, end: _end, ...props }: Record<string, unknown>) => {
      const cls = typeof className === "function" ? (className as (...args: unknown[]) => unknown)({ isActive: false }) : className;
      const { ...rest } = props;
      return React.createElement("a", { ...rest, href: to, className: cls }, children as React.ReactNode);
    },
    Link: ({ to, children, ...props }: Record<string, unknown>) =>
      React.createElement("a", { ...props, href: to }, children as React.ReactNode),
  };
});

import DashboardLayout from "~/routes/dashboard";

describe("DashboardLayout component", () => {
  it("renders the DashboardNav with shop domain", () => {
    render(<DashboardLayout />);
    expect(screen.getByText("test-store.myshopify.com")).toBeInTheDocument();
  });

  it("renders the Outlet for child routes", () => {
    render(<DashboardLayout />);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<DashboardLayout />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Recovery Cases")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders the BitPushy logo", () => {
    render(<DashboardLayout />);
    expect(screen.getByLabelText("BitPushy")).toBeInTheDocument();
  });

  describe("sidebar upgrade banner", () => {
    it("renders upgrade banner for FREE users", () => {
      mocks.useLoaderData.mockReturnValue({
        shopDomain: "test-store.myshopify.com",
        planTier: "FREE",
      });
      render(<DashboardLayout />);
      expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
      expect(
        screen.getByText(/Unlimited cases, SMS recovery/)
      ).toBeInTheDocument();
    });

    it("renders View Plans link pointing to settings", () => {
      mocks.useLoaderData.mockReturnValue({
        shopDomain: "test-store.myshopify.com",
        planTier: "FREE",
      });
      render(<DashboardLayout />);
      const viewPlansLink = screen.getByText("View Plans");
      expect(viewPlansLink.closest("a")).toHaveAttribute(
        "href",
        "/dashboard/settings"
      );
    });

    it("hides upgrade banner for PRO users", () => {
      mocks.useLoaderData.mockReturnValue({
        shopDomain: "test-store.myshopify.com",
        planTier: "PRO",
      });
      render(<DashboardLayout />);
      expect(screen.queryByText("Upgrade to Pro")).not.toBeInTheDocument();
      expect(screen.queryByText("View Plans")).not.toBeInTheDocument();
    });
  });
});
