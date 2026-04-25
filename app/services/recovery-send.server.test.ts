import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaseStatus, CaseType, Channel } from "@prisma/client";

const mockFindUnique = vi.fn();
const mockSendRecoveryEmail = vi.fn();
const mockSendRecoverySMS = vi.fn();
const mockGetEmailCopy = vi.fn();
const mockMarkMessageSent = vi.fn();
const mockMarkSmsMessageSentWithMetering = vi.fn();
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
  markSmsMessageSentWithMetering: (...args: unknown[]) =>
    mockMarkSmsMessageSentWithMetering(...args),
}));

vi.mock("~/models/sms-opt-out.server", () => ({
  isPhoneOptedOut: (...args: unknown[]) => mockIsPhoneOptedOut(...args),
}));

vi.mock("~/lib/settings", () => ({
  parseShopSettings: (...args: unknown[]) => mockParseShopSettings(...args),
}));

import { processRecoveryMessage } from "./recovery-send.server";
import { buildRecoveryMessage } from "~/test/fixtures";

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
    mockSendRecoverySMS.mockResolvedValue({
      sid: "SM123456",
      numSegments: null,
      priceUsdCents: null,
      countryCode: "US",
    });
    mockMarkMessageSent.mockResolvedValue(undefined);
    mockMarkSmsMessageSentWithMetering.mockResolvedValue(undefined);
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
        buildRecoveryMessage({ message: { sentAt: new Date() } })
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
        buildRecoveryMessage({ message: { deliveryStatus: "cancelled" } })
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
          buildRecoveryMessage({
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
        buildRecoveryMessage({ checkout: { recoveryUrl: null } })
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
        buildRecoveryMessage({ message: { channel: Channel.EMAIL } })
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
        buildRecoveryMessage({
          message: { channel: Channel.EMAIL, sequenceStep: 2 },
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
        buildRecoveryMessage({
          message: { channel: Channel.EMAIL },
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
        buildRecoveryMessage({
          message: { channel: Channel.EMAIL },
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
        buildRecoveryMessage({ message: { channel: Channel.SMS } })
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
      // SMS success path routes through the metering helper, NOT plain
      // markMessageSent — so consentSource + countryCode + segment fields
      // land on the RecoveryMessage row.
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
      expect(mockMarkSmsMessageSentWithMetering).toHaveBeenCalledWith({
        messageId: 1,
        providerMessageId: "SM123456",
        numSegments: null,
        priceUsdCents: null,
        countryCode: "US",
        consentSource: "checkout_phone_field",
      });
    });

    it("forwards Twilio-populated metering fields verbatim to the helper", async () => {
      mockFindUnique.mockResolvedValue(
        buildRecoveryMessage({ message: { id: 99, channel: Channel.SMS } })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);
      mockSendRecoverySMS.mockResolvedValue({
        sid: "SM-full",
        numSegments: 2,
        priceUsdCents: 2,
        countryCode: "CA",
      });

      await processRecoveryMessage({
        recoveryMessageId: 99,
        recoveryCaseId: 10,
      });

      expect(mockMarkSmsMessageSentWithMetering).toHaveBeenCalledWith({
        messageId: 99,
        providerMessageId: "SM-full",
        numSegments: 2,
        priceUsdCents: 2,
        countryCode: "CA",
        consentSource: "checkout_phone_field",
      });
    });

    it("uses correct SMS template for LIKELY_PAYMENT_STAGE_ABANDONMENT", async () => {
      mockFindUnique.mockResolvedValue(
        buildRecoveryMessage({
          message: { channel: Channel.SMS },
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
        buildRecoveryMessage({ message: { channel: Channel.SMS } })
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
        buildRecoveryMessage({ message: { channel: Channel.SMS } })
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
        buildRecoveryMessage({
          message: { channel: Channel.SMS },
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
        buildRecoveryMessage({
          message: { channel: Channel.SMS },
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
        buildRecoveryMessage({
          message: { channel: Channel.SMS },
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
        buildRecoveryMessage({ message: { channel: Channel.EMAIL } })
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
        buildRecoveryMessage({ message: { channel: Channel.EMAIL } })
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
        buildRecoveryMessage({ message: { channel: Channel.SMS } })
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
        buildRecoveryMessage({ message: { id: 42, channel: Channel.EMAIL } })
      );
      mockSendRecoveryEmail.mockResolvedValue("postmark-id-abc");

      await processRecoveryMessage({
        recoveryMessageId: 42,
        recoveryCaseId: 10,
      });

      expect(mockMarkMessageSent).toHaveBeenCalledWith(42, "postmark-id-abc");
    });

    it("calls markSmsMessageSentWithMetering after a successful SMS send", async () => {
      mockFindUnique.mockResolvedValue(
        buildRecoveryMessage({ message: { id: 77, channel: Channel.SMS } })
      );
      mockIsPhoneOptedOut.mockResolvedValue(false);
      mockSendRecoverySMS.mockResolvedValue({
        sid: "SMxyz789",
        numSegments: 1,
        priceUsdCents: 1,
        countryCode: "US",
      });

      await processRecoveryMessage({
        recoveryMessageId: 77,
        recoveryCaseId: 10,
      });

      expect(mockMarkSmsMessageSentWithMetering).toHaveBeenCalledWith({
        messageId: 77,
        providerMessageId: "SMxyz789",
        numSegments: 1,
        priceUsdCents: 1,
        countryCode: "US",
        consentSource: "checkout_phone_field",
      });
      expect(mockMarkMessageSent).not.toHaveBeenCalled();
    });

    it("calls markMessageSent with email ID after opt-out fallback", async () => {
      mockFindUnique.mockResolvedValue(
        buildRecoveryMessage({ message: { id: 55, channel: Channel.SMS } })
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
