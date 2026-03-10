// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("~/lib/session.server", () => ({
  requireShopId: vi.fn(),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: vi.fn(),
  updateShopSettings: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {},
}));

const mocks = vi.hoisted(() => ({
  useLoaderData: vi.fn(),
  useActionData: vi.fn().mockReturnValue(null),
  useNavigation: vi.fn().mockReturnValue({ state: "idle" }),
}));

vi.mock("@remix-run/react", async () => {
  const React = await import("react");
  return {
    useLoaderData: mocks.useLoaderData,
    useActionData: mocks.useActionData,
    useNavigation: mocks.useNavigation,
    Form: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      method?: string;
      className?: string;
    }) => React.createElement("form", props, children),
  };
});

import { beforeEach } from "vitest";
import DashboardSettings from "~/routes/dashboard.settings";
import { DEFAULT_SETTINGS } from "~/lib/settings";

const MOCK_SETTINGS = {
  recoveryEnabled: true,
  retryDelays: [15, 720, 2160],
  smsEnabled: false,
  channelSequence: ["EMAIL" as const, "EMAIL" as const, "EMAIL" as const],
  emailTemplates: {
    confirmedDecline: {
      subject: "Complete your purchase",
      body: "Your payment was declined.",
    },
    likelyAbandonment: {
      subject: "Did you forget something?",
      body: "We noticed you left items behind.",
    },
  },
  smsTemplates: {
    confirmedDecline: {
      body: "Your payment was declined. Complete your purchase: {{recovery_url}}",
    },
    likelyAbandonment: {
      body: "Don't miss out! Complete your order: {{recovery_url}}",
    },
  },
};

describe("DashboardSettings component", () => {
  beforeEach(() => {
    mocks.useActionData.mockReturnValue(null);
    mocks.useNavigation.mockReturnValue({ state: "idle" });
  });

  it("renders Settings heading", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders description text", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Configure your recovery workflow")
    ).toBeInTheDocument();
  });

  it("renders Recovery Workflow section", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Recovery Workflow")).toBeInTheDocument();
  });

  it("renders Enable automated recovery checkbox", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Enable automated recovery")
    ).toBeInTheDocument();
    const checkbox = screen.getByLabelText("Enable automated recovery");
    expect(checkbox).toBeChecked();
  });

  it("renders retry delays input with values", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const input = screen.getByLabelText(
      "Retry delays (minutes, comma-separated)"
    );
    expect(input).toHaveValue("15,720,2160");
  });

  it("renders Channel Configuration section", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Channel Configuration")).toBeInTheDocument();
  });

  it("renders Enable SMS messaging checkbox unchecked when smsEnabled is false", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const checkbox = screen.getByLabelText("Enable SMS messaging");
    expect(checkbox).not.toBeChecked();
  });

  it("renders Confirmed Decline Templates section", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Confirmed Decline Templates")
    ).toBeInTheDocument();
  });

  it("renders confirmed decline email subject input", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const input = screen.getByLabelText("Email Subject", {
      selector: "#confirmedDeclineSubject",
    });
    expect(input).toHaveValue("Complete your purchase");
  });

  it("renders confirmed decline email body textarea", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const textarea = screen.getByLabelText("Email Body", {
      selector: "#confirmedDeclineBody",
    });
    expect(textarea).toHaveValue("Your payment was declined.");
  });

  it("renders Likely Abandonment Templates section", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Likely Abandonment Templates")
    ).toBeInTheDocument();
  });

  it("renders likely abandonment email subject input", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const input = screen.getByLabelText("Email Subject", {
      selector: "#likelyAbandonmentSubject",
    });
    expect(input).toHaveValue("Did you forget something?");
  });

  it("renders likely abandonment email body textarea", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const textarea = screen.getByLabelText("Email Body", {
      selector: "#likelyAbandonmentBody",
    });
    expect(textarea).toHaveValue("We noticed you left items behind.");
  });

  it("renders Save Settings button", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    const button = screen.getByRole("button", { name: "Save Settings" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows Saving... when submitting", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    mocks.useNavigation.mockReturnValue({ state: "submitting" });
    render(<DashboardSettings />);
    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
  });

  it("shows success banner when action returns success", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    mocks.useActionData.mockReturnValue({ success: true });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Settings saved successfully.")
    ).toBeInTheDocument();
  });

  it("does not show success banner when action has no result", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    mocks.useActionData.mockReturnValue(null);
    render(<DashboardSettings />);
    expect(
      screen.queryByText("Settings saved successfully.")
    ).not.toBeInTheDocument();
  });

  it("renders with default settings", () => {
    mocks.useLoaderData.mockReturnValue({ settings: DEFAULT_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    const recoveryCheckbox = screen.getByLabelText(
      "Enable automated recovery"
    );
    expect(recoveryCheckbox).toBeChecked();
  });

  it("renders channel step labels with formatted delay", () => {
    mocks.useLoaderData.mockReturnValue({ settings: MOCK_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(screen.getByText("Step 3")).toBeInTheDocument();
  });

  it("renders unchecked recovery when disabled", () => {
    mocks.useLoaderData.mockReturnValue({
      settings: { ...MOCK_SETTINGS, recoveryEnabled: false },
    });
    render(<DashboardSettings />);
    const checkbox = screen.getByLabelText("Enable automated recovery");
    expect(checkbox).not.toBeChecked();
  });
});
