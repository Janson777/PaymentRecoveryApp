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

vi.mock("~/lib/plan.server", () => ({
  getMonthlyUsageCount: vi.fn(),
  FREE_CASES_LIMIT: 100,
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

const defaultLoaderData = {
  settings: MOCK_SETTINGS,
  planTier: "FREE" as const,
  billingActivatedAt: null as string | null,
  monthlyUsage: 23,
  maxCasesPerMonth: 100,
  shopDomain: "test-store.myshopify.com",
};

describe("DashboardSettings component", () => {
  beforeEach(() => {
    mocks.useActionData.mockReturnValue(null);
    mocks.useNavigation.mockReturnValue({ state: "idle" });
  });

  it("renders Settings heading", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders description text", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(
      screen.getByText("Configure your recovery workflow")
    ).toBeInTheDocument();
  });

  it("renders Recovery Workflow section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Recovery Workflow")).toBeInTheDocument();
  });

  it("renders Enable automated recovery checkbox", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(
      screen.getByText("Enable automated recovery")
    ).toBeInTheDocument();
    const checkbox = screen.getByLabelText("Enable automated recovery");
    expect(checkbox).toBeChecked();
  });

  it("renders delay sliders for steps 1-2 on FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("12 hrs")).toBeInTheDocument();
  });

  it("renders delay sliders for all 3 steps on PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
    });
    render(<DashboardSettings />);
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("12 hrs")).toBeInTheDocument();
    expect(screen.getByText("1.5 days")).toBeInTheDocument();
  });

  it("renders Channel Configuration section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Channel Configuration")).toBeInTheDocument();
  });

  it("renders SMS checkbox disabled on FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const checkbox = screen.getByLabelText("Enable SMS messaging");
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it("renders SMS checkbox enabled on PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
      settings: { ...MOCK_SETTINGS, smsEnabled: false },
    });
    render(<DashboardSettings />);
    const checkbox = screen.getByLabelText("Enable SMS messaging");
    expect(checkbox).not.toBeDisabled();
  });

  it("shows SMS upgrade prompt on FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText(/SMS messaging is a Pro feature/)).toBeInTheDocument();
  });

  it("does not show SMS upgrade prompt on PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
    });
    render(<DashboardSettings />);
    expect(screen.queryByText(/SMS messaging is a Pro feature/)).not.toBeInTheDocument();
  });

  it("renders Confirmed Decline Templates section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(
      screen.getByText("Confirmed Decline Templates")
    ).toBeInTheDocument();
  });

  it("renders confirmed decline email subject input", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const input = screen.getByLabelText("Email Subject", {
      selector: "#confirmedDeclineSubject",
    });
    expect(input).toHaveValue("Complete your purchase");
  });

  it("renders confirmed decline email body textarea", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const textarea = screen.getByLabelText("Email Body", {
      selector: "#confirmedDeclineBody",
    });
    expect(textarea).toHaveValue("Your payment was declined.");
  });

  it("renders Likely Abandonment Templates section", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(
      screen.getByText("Likely Abandonment Templates")
    ).toBeInTheDocument();
  });

  it("renders likely abandonment email subject input", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const input = screen.getByLabelText("Email Subject", {
      selector: "#likelyAbandonmentSubject",
    });
    expect(input).toHaveValue("Did you forget something?");
  });

  it("renders likely abandonment email body textarea", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const textarea = screen.getByLabelText("Email Body", {
      selector: "#likelyAbandonmentBody",
    });
    expect(textarea).toHaveValue("We noticed you left items behind.");
  });

  it("renders Save Settings button", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const button = screen.getByRole("button", { name: "Save Settings" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows Saving... when submitting", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    mocks.useNavigation.mockReturnValue({ state: "submitting" });
    render(<DashboardSettings />);
    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
  });

  it("shows success banner when action returns success", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    mocks.useActionData.mockReturnValue({ success: true });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Settings saved successfully.")
    ).toBeInTheDocument();
  });

  it("does not show success banner when action has no result", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    mocks.useActionData.mockReturnValue(null);
    render(<DashboardSettings />);
    expect(
      screen.queryByText("Settings saved successfully.")
    ).not.toBeInTheDocument();
  });

  it("renders with default settings", () => {
    mocks.useLoaderData.mockReturnValue({ ...defaultLoaderData, settings: DEFAULT_SETTINGS });
    render(<DashboardSettings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    const recoveryCheckbox = screen.getByLabelText(
      "Enable automated recovery"
    );
    expect(recoveryCheckbox).toBeChecked();
  });

  it("renders channel step labels with formatted delay", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Attempt 1")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByText("Attempt 3")).toBeInTheDocument();
  });

  it("renders unchecked recovery when disabled", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      settings: { ...MOCK_SETTINGS, recoveryEnabled: false },
    });
    render(<DashboardSettings />);
    const checkbox = screen.getByLabelText("Enable automated recovery");
    expect(checkbox).not.toBeChecked();
  });

  it("renders Subscription section with PlanCard", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Subscription")).toBeInTheDocument();
  });

  it("shows Starter badge for FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Starter")).toBeInTheDocument();
  });

  it("shows monthly usage count for FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("cases this month")).toBeInTheDocument();
  });

  it("shows Upgrade to Pro button for FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const buttons = screen.getAllByText("Upgrade to Pro");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Pro badge and active date for PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
      billingActivatedAt: "2026-03-10T00:00:00.000Z",
      monthlyUsage: 50,
    });
    render(<DashboardSettings />);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText(/Active since/)).toBeInTheDocument();
  });

  it("does not show Upgrade button for PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
      billingActivatedAt: "2026-03-10T00:00:00.000Z",
    });
    render(<DashboardSettings />);
    expect(screen.queryByText("Upgrade to Pro")).not.toBeInTheDocument();
  });

  it("shows Shopify admin note for PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
      billingActivatedAt: "2026-03-10T00:00:00.000Z",
    });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Subscription is managed through your Shopify admin.")
    ).toBeInTheDocument();
  });

  it("shows approaching limit warning when usage is high", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      monthlyUsage: 95,
    });
    render(<DashboardSettings />);
    expect(screen.getByText("Approaching monthly limit")).toBeInTheDocument();
  });

  it("shows limit reached warning when usage hits max", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      monthlyUsage: 100,
    });
    render(<DashboardSettings />);
    expect(
      screen.getByText("Monthly limit reached — new cases are paused")
    ).toBeInTheDocument();
  });

  it("shows locked Attempt 3 with upgrade prompt on FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.getByText("Attempt 3")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Pro to unlock 3-step sequences")).toBeInTheDocument();
  });

  it("does not show locked Attempt 3 on PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
    });
    render(<DashboardSettings />);
    expect(screen.getByText("Attempt 3")).toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Pro to unlock 3-step sequences")).not.toBeInTheDocument();
  });

  it("shows Pro badges on locked features for FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    const proBadges = screen.getAllByText("Pro");
    expect(proBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show SMS pricing note on FREE plan", () => {
    mocks.useLoaderData.mockReturnValue(defaultLoaderData);
    render(<DashboardSettings />);
    expect(screen.queryByText(/SMS is included with Pro/)).not.toBeInTheDocument();
  });

  it("shows SMS pricing note on PRO plan", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
    });
    render(<DashboardSettings />);
    expect(screen.getByText(/SMS is included with Pro/)).toBeInTheDocument();
    expect(
      screen.getByText(/500 segments per cycle/)
    ).toBeInTheDocument();
  });

  it("SMS pricing note does NOT mention Twilio credentials (avoids BYO-Twilio confusion)", () => {
    mocks.useLoaderData.mockReturnValue({
      ...defaultLoaderData,
      planTier: "PRO" as const,
    });
    render(<DashboardSettings />);
    expect(screen.queryByText(/Twilio credentials/i)).not.toBeInTheDocument();
  });

  describe("phone collection banner", () => {
    it("does not show banner on FREE plan (SMS is locked)", () => {
      mocks.useLoaderData.mockReturnValue(defaultLoaderData);
      render(<DashboardSettings />);
      expect(
        screen.queryByText("Make sure your checkout collects phone numbers")
      ).not.toBeInTheDocument();
    });

    it("does not show banner on PRO plan when SMS is disabled", () => {
      mocks.useLoaderData.mockReturnValue({
        ...defaultLoaderData,
        planTier: "PRO" as const,
        settings: { ...MOCK_SETTINGS, smsEnabled: false },
      });
      render(<DashboardSettings />);
      expect(
        screen.queryByText("Make sure your checkout collects phone numbers")
      ).not.toBeInTheDocument();
    });

    it("shows banner on PRO plan when SMS is enabled", () => {
      mocks.useLoaderData.mockReturnValue({
        ...defaultLoaderData,
        planTier: "PRO" as const,
        settings: { ...MOCK_SETTINGS, smsEnabled: true },
      });
      render(<DashboardSettings />);
      expect(
        screen.getByText("Make sure your checkout collects phone numbers")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/SMS recovery only works for customers/)
      ).toBeInTheDocument();
    });

    it("banner reassures merchants that missing phones fall back to email", () => {
      mocks.useLoaderData.mockReturnValue({
        ...defaultLoaderData,
        planTier: "PRO" as const,
        settings: { ...MOCK_SETTINGS, smsEnabled: true },
      });
      render(<DashboardSettings />);
      expect(
        screen.getByText(/fall back to email/i)
      ).toBeInTheDocument();
    });

    it("banner links to the merchant's Shopify admin checkout settings", () => {
      mocks.useLoaderData.mockReturnValue({
        ...defaultLoaderData,
        planTier: "PRO" as const,
        settings: { ...MOCK_SETTINGS, smsEnabled: true },
        shopDomain: "acme-widgets.myshopify.com",
      });
      render(<DashboardSettings />);
      const link = screen.getByText("Open checkout settings").closest("a");
      expect(link).toHaveAttribute(
        "href",
        "https://acme-widgets.myshopify.com/admin/settings/checkout"
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("banner includes a link to the Shopify Help docs", () => {
      mocks.useLoaderData.mockReturnValue({
        ...defaultLoaderData,
        planTier: "PRO" as const,
        settings: { ...MOCK_SETTINGS, smsEnabled: true },
      });
      render(<DashboardSettings />);
      const link = screen.getByText("Learn more in Shopify Help").closest("a");
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("help.shopify.com")
      );
      expect(link).toHaveAttribute("target", "_blank");
    });
  });
});
