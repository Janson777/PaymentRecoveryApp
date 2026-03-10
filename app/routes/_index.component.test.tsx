// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  getShopId: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  useNavigation: vi.fn().mockReturnValue({ state: "idle" }),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useNavigation: mocks.useNavigation,
    Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("form", props, children),
  };
});

import Index from "~/routes/_index";

describe("Index component", () => {
  beforeEach(() => {
    mocks.useNavigation.mockReturnValue({ state: "idle" });
  });

  it("renders the Payment Recovery heading", () => {
    render(<Index />);
    expect(screen.getByText("Payment Recovery")).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<Index />);
    expect(
      screen.getByText(/Recover sales lost to declined payments/)
    ).toBeInTheDocument();
  });

  it("renders the shop input field", () => {
    render(<Index />);
    const input = screen.getByPlaceholderText("your-store.myshopify.com");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("name", "shop");
    expect(input).toBeRequired();
  });

  it("renders Install on Shopify button when idle", () => {
    render(<Index />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Install on Shopify");
    expect(button).not.toBeDisabled();
  });

  it("shows Redirecting… and disables button when submitting", () => {
    mocks.useNavigation.mockReturnValue({ state: "submitting" });
    render(<Index />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Redirecting…");
    expect(button).toBeDisabled();
  });

  it("form points to /auth/shopify", () => {
    render(<Index />);
    const form = document.querySelector("form");
    expect(form).toHaveAttribute("action", "/auth/shopify");
    expect(form).toHaveAttribute("method", "get");
  });

  it("renders helper text", () => {
    render(<Index />);
    expect(
      screen.getByText("Enter your Shopify store domain to get started")
    ).toBeInTheDocument();
  });
});
