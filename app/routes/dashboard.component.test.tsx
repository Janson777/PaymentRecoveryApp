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
  useLoaderData: vi.fn().mockReturnValue({ shopDomain: "test-store.myshopify.com" }),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    Outlet: () => React.createElement("div", { "data-testid": "outlet" }, "Outlet Content"),
    NavLink: ({ to, children, className, end, ...props }: Record<string, unknown>) => {
      const cls = typeof className === "function" ? (className as Function)({ isActive: false }) : className;
      const { ...rest } = props;
      return React.createElement("a", { ...rest, href: to, className: cls }, children as React.ReactNode);
    },
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

  it("renders the Recovery brand text", () => {
    render(<DashboardLayout />);
    expect(screen.getByText("Recovery")).toBeInTheDocument();
  });
});
