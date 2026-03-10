// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/db.server", () => ({
  prisma: {},
}));

vi.mock("~/lib/session.server", () => ({
  sessionStorage: {
    getSession: vi.fn(),
    commitSession: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("form", props, children),
  };
});

import DevLogin from "~/routes/dev.login";

describe("DevLogin component", () => {
  it("renders Dev Login heading", () => {
    mocks.useLoaderData.mockReturnValue({ shops: [] });
    render(<DevLogin />);
    expect(screen.getByText("Dev Login")).toBeInTheDocument();
  });

  it("renders DEV ONLY badge", () => {
    mocks.useLoaderData.mockReturnValue({ shops: [] });
    render(<DevLogin />);
    expect(screen.getByText("DEV ONLY")).toBeInTheDocument();
  });

  it("renders description text", () => {
    mocks.useLoaderData.mockReturnValue({ shops: [] });
    render(<DevLogin />);
    expect(
      screen.getByText(/Bypass Shopify OAuth/)
    ).toBeInTheDocument();
  });

  it("shows no shops found message when list is empty", () => {
    mocks.useLoaderData.mockReturnValue({ shops: [] });
    render(<DevLogin />);
    expect(screen.getByText(/No shops found/)).toBeInTheDocument();
  });

  it("renders shop list with domains", () => {
    mocks.useLoaderData.mockReturnValue({
      shops: [
        { id: 1, shopDomain: "store-one.myshopify.com" },
        { id: 2, shopDomain: "store-two.myshopify.com" },
      ],
    });
    render(<DevLogin />);
    expect(screen.getByText("store-one.myshopify.com")).toBeInTheDocument();
    expect(screen.getByText("store-two.myshopify.com")).toBeInTheDocument();
  });

  it("renders shop IDs", () => {
    mocks.useLoaderData.mockReturnValue({
      shops: [
        { id: 1, shopDomain: "store-one.myshopify.com" },
        { id: 42, shopDomain: "store-two.myshopify.com" },
      ],
    });
    render(<DevLogin />);
    expect(screen.getByText("ID: 1")).toBeInTheDocument();
    expect(screen.getByText("ID: 42")).toBeInTheDocument();
  });

  it("renders Login arrow for each shop", () => {
    mocks.useLoaderData.mockReturnValue({
      shops: [
        { id: 1, shopDomain: "store-one.myshopify.com" },
        { id: 2, shopDomain: "store-two.myshopify.com" },
      ],
    });
    render(<DevLogin />);
    const loginButtons = screen.getAllByText("Login →");
    expect(loginButtons).toHaveLength(2);
  });

  it("renders hidden shopId inputs in forms", () => {
    mocks.useLoaderData.mockReturnValue({
      shops: [{ id: 77, shopDomain: "test.myshopify.com" }],
    });
    render(<DevLogin />);
    const hiddenInput = document.querySelector(
      'input[name="shopId"][value="77"]'
    );
    expect(hiddenInput).toBeInTheDocument();
  });

  it("renders forms with POST method", () => {
    mocks.useLoaderData.mockReturnValue({
      shops: [{ id: 1, shopDomain: "test.myshopify.com" }],
    });
    render(<DevLogin />);
    const form = document.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
  });
});
