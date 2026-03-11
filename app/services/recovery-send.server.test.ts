import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaseStatus, CaseType, Channel } from "@prisma/client";

const mockFindUnique = vi.fn();
const mockSendRecoveryEmail = vi.fn();
const mockSendRecoverySMS = vi.fn();
const mockGetEmailCopy = vi.fn();
const mockMarkMessageSent = vi.fn();
const mockIsPhoneOptedOut = vi.fn();
const mockParseShopSettings = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    recoveryMessage: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("./email.server", () => ({
  sendRecoveryEmail: (...args: unknown[]) => mockSendRecoveryEmail(...args),
}));

vi.mock("./sms.server", () => ({
  sendRecoverySMS: (...args: unknown[]) => mockSendRecoverySMS(...args),
}));

vi.mock("./recovery-workflow.server", () => ({
  getEmailCopy: (...args: unknown[]) => mockGetEmailCopy(...args),
}));

vi.mock("~/models/recovery-message.server", () => ({
  markMessageSent: (...args: unknown[]) => mockMarkMessageSent(...args),
}));

vi.mock("~/models/sms-opt-out.server", () => ({
  isPhoneOptedOut: (...args: unknown[]) => mockIsPhoneOptedOut(...args),
}));

vi.mock("~/lib/settings", () => ({
  parseShopSettings: (...args: unknown[]) => mockParseShopSettings(...args),
}));

import { processRecoveryMessage } from "./recovery-send.server";

function buildMessage(overrides: Record<string, unknown> = {}) {
  const checkout = {
    id: 100,
    email: "customer@example.com",
    phone: "+15551234567",
    recoveryUrl: "https://shop.example.com/checkout/recover/abc123",
    ...((overrides.checkout as Record<string, unknown>) ?? {}),
  };

  const shop = {
    id: 1,
    settingsJson: {},
    ...((overrides.shop as Record<string, unknown>) ?? {}),
  };

  const recoveryCase = {
    id: 10,
    shopId: 1,
    caseStatus: CaseStatus.READY,
    caseType: CaseType.CONFIRMED_DECLINE,
    checkout,
    shop,
    ...((overrides.recoveryCase as Record<string, unknown>) ?? {}),
  };

  return {
    id: 1,
    channel: Channel.EMAIL,
    sequenceStep: 1,
    sentAt: null,
    deliveryStatus: "pending",
    recoveryCase,
    ...overrides,
    // Ensure nested overrides don't clobber the full object
    ...(overrides.recoveryCase ? { recoveryCase } : {}),
  };
}

const DEFAULT_SMS_SETTINGS = {
  smsTemplates: {
    confirmedDecline: {
      body: "Payment failed! Complete your order: {{recovery_url}}",
    },
    likelyAbandonment: {
      body: "You left items behind! Complete your order: {{recovery_url}}",
    },
  },
};

describe("processRecoveryMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = "https://app.example.com";
    mockGetEmailCopy.mockReturnValue({
      subject: "Test Subject",
      body: "Test body",
    });
    mockSendRecoveryEmail.mockResolvedValue("email-msg-id-123");
    mockSendRecoverySMS.mockResolvedValue("SM123456");
    mockMarkMessageSent.mockResolvedValue(undefined);
    mockIsPhoneOptedOut.mockResolvedValue(false);
    mockParseShopSettings.mockReturnValue(DEFAULT_SMS_SETTINGS);
  });

  describe("early exits", () => {
    it("returns early when message is not found", async () => {
      mockFindUnique.mockResolvedValue(null);

      await processRecoveryMessage({
        recoveryMessageId: 999,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("returns early when message was already sent", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ sentAt: new Date() })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("returns early when message is cancelled", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ deliveryStatus: "cancelled" })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("returns early when case is not in active status", async () => {
      for (const status of [
        CaseStatus.CANDIDATE,
        CaseStatus.SUPPRESSED,
        CaseStatus.RECOVERED,
        CaseStatus.EXPIRED,
        CaseStatus.CANCELLED,
      ]) {
        mockFindUnique.mockResolvedValue(
          buildMessage({
            recoveryCase: { caseStatus: status },
          })
        );

        await processRecoveryMessage({
          recoveryMessageId: 1,
          recoveryCaseId: 10,
        });
      }

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("returns early when checkout has no recovery URL", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ checkout: { recoveryUrl: null } })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });
  });

  describe("email channel", () => {
    it("sends email for EMAIL channel messages", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.EMAIL })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockGetEmailCopy).toHaveBeenCalledWith(
        CaseType.CONFIRMED_DECLINE,
        1
      );
      expect(mockSendRecoveryEmail).toHaveBeenCalledWith({
        to: "customer@example.com",
        subject: "Test Subject",
        body: "Test body",
        recoveryUrl: "https://app.example.com/r/10",
        trackingUrl: undefined,
      });
      expect(mockMarkMessageSent).toHaveBeenCalledWith(1, "email-msg-id-123");
    });

    it("uses correct email copy for LIKELY_PAYMENT_STAGE_ABANDONMENT case type", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.EMAIL,
          sequenceStep: 2,
          recoveryCase: { caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT },
        })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockGetEmailCopy).toHaveBeenCalledWith(
        CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
        2
      );
    });

    it("returns early when EMAIL channel has no email address", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.EMAIL,
          checkout: { email: null },
        })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("works with MESSAGING case status", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.EMAIL,
          recoveryCase: { caseStatus: CaseStatus.MESSAGING },
        })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).toHaveBeenCalled();
      expect(mockMarkMessageSent).toHaveBeenCalled();
    });
  });

  describe("SMS channel", () => {
    it("sends SMS when phone is available and not opted out", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockIsPhoneOptedOut).toHaveBeenCalledWith("+15551234567");
      expect(mockParseShopSettings).toHaveBeenCalled();
      expect(mockSendRecoverySMS).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "Payment failed! Complete your order: https://app.example.com/r/10",
      });
      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).toHaveBeenCalledWith(1, "SM123456");
    });

    it("uses correct SMS template for LIKELY_PAYMENT_STAGE_ABANDONMENT", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.SMS,
          recoveryCase: { caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT },
        })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "You left items behind! Complete your order: https://app.example.com/r/10",
      });
    });

    it("substitutes {{recovery_url}} in merchant SMS template", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);
      mockParseShopSettings.mockReturnValue({
        smsTemplates: {
          confirmedDecline: {
            body: "Hi! Your order is saved at {{recovery_url}} — hurry back!",
          },
          likelyAbandonment: { body: "Cart waiting: {{recovery_url}}" },
        },
      });

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "Hi! Your order is saved at https://app.example.com/r/10 — hurry back!",
      });
    });
  });

  describe("SMS opt-out fallback to email", () => {
    it("falls back to email when phone is opted out", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(true);

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockGetEmailCopy).toHaveBeenCalledWith(
        CaseType.CONFIRMED_DECLINE,
        1
      );
      expect(mockSendRecoveryEmail).toHaveBeenCalledWith({
        to: "customer@example.com",
        subject: "Test Subject",
        body: "Test body",
        recoveryUrl: "https://app.example.com/r/10",
        trackingUrl: undefined,
      });
      expect(mockMarkMessageSent).toHaveBeenCalledWith(1, "email-msg-id-123");
    });

    it("returns early when opted out and no email available", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.SMS,
          checkout: { email: null },
        })
      );
      mockIsPhoneOptedOut.mockResolvedValue(true);

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });
  });

  describe("SMS missing phone fallback to email", () => {
    it("falls back to email when phone number is missing", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.SMS,
          checkout: { phone: null },
        })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockIsPhoneOptedOut).not.toHaveBeenCalled();
      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockSendRecoveryEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "customer@example.com" })
      );
      expect(mockMarkMessageSent).toHaveBeenCalledWith(1, "email-msg-id-123");
    });

    it("returns early when phone is missing and email is also missing", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({
          channel: Channel.SMS,
          checkout: { phone: null, email: null },
        })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).not.toHaveBeenCalled();
      expect(mockSendRecoveryEmail).not.toHaveBeenCalled();
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });
  });

  describe("tracking URL and APP_URL", () => {
    it("builds tracking URL from APP_URL env var", async () => {
      process.env.APP_URL = "https://custom-domain.com";
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.EMAIL })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryUrl: "https://custom-domain.com/r/10",
        })
      );
    });

    it("falls back to localhost when APP_URL is not set", async () => {
      delete process.env.APP_URL;
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.EMAIL })
      );

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoveryEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryUrl: "http://localhost:3000/r/10",
        })
      );
    });

    it("uses tracking URL in SMS body", async () => {
      process.env.APP_URL = "https://custom-domain.com";
      mockFindUnique.mockResolvedValue(
        buildMessage({ channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);

      await processRecoveryMessage({
        recoveryMessageId: 1,
        recoveryCaseId: 10,
      });

      expect(mockSendRecoverySMS).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("https://custom-domain.com/r/10"),
        })
      );
    });
  });

  describe("markMessageSent integration", () => {
    it("calls markMessageSent with email provider ID after email send", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ id: 42, channel: Channel.EMAIL })
      );
      mockSendRecoveryEmail.mockResolvedValue("postmark-id-abc");

      await processRecoveryMessage({
        recoveryMessageId: 42,
        recoveryCaseId: 10,
      });

      expect(mockMarkMessageSent).toHaveBeenCalledWith(42, "postmark-id-abc");
    });

    it("calls markMessageSent with SMS provider ID after SMS send", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ id: 77, channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);
      mockSendRecoverySMS.mockResolvedValue("SMxyz789");

      await processRecoveryMessage({
        recoveryMessageId: 77,
        recoveryCaseId: 10,
      });

      expect(mockMarkMessageSent).toHaveBeenCalledWith(77, "SMxyz789");
    });

    it("calls markMessageSent with email ID after opt-out fallback", async () => {
      mockFindUnique.mockResolvedValue(
        buildMessage({ id: 55, channel: Channel.SMS })
      );
      mockIsPhoneOptedOut.mockResolvedValue(true);
      mockSendRecoveryEmail.mockResolvedValue("fallback-email-id");

      await processRecoveryMessage({
        recoveryMessageId: 55,
        recoveryCaseId: 10,
      });

      expect(mockMarkMessageSent).toHaveBeenCalledWith(
        55,
        "fallback-email-id"
      );
    });
  });
});
