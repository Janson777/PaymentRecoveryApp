import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CaseStatus,
  CaseType,
  Channel,
  ProcessingStatus,
  SignalType,
} from "@prisma/client";

// --- Mock boundaries (database + external services) ---

const {
  mockWebhookFindUnique,
  mockPaymentSignalFindFirst,
  mockRecoveryMessageFindUnique,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockWebhookFindUnique: vi.fn(),
  mockPaymentSignalFindFirst: vi.fn(),
  mockRecoveryMessageFindUnique: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

vi.mock("~/lib/db.server", () => ({
  prisma: {
    webhookEvent: { findUnique: mockWebhookFindUnique },
    paymentSignal: { findFirst: mockPaymentSignalFindFirst },
    recoveryMessage: { findUnique: mockRecoveryMessageFindUnique },
  },
}));

vi.mock("~/models/webhook-event.server");
vi.mock("~/models/checkout.server");
vi.mock("~/models/payment-signal.server");
vi.mock("~/models/order.server");
vi.mock("~/models/recovery-case.server");
vi.mock("~/models/recovery-message.server");
vi.mock("~/models/shop.server");
vi.mock("~/models/sms-opt-out.server");
vi.mock("~/services/email.server");
vi.mock("~/services/sms.server");

vi.mock("~/queues/recovery.server", () => ({
  getRecoveryQueue: () => ({ add: mockQueueAdd }),
}));

// --- Import real services (logic runs unmodified) ---
import { processWebhookEvent } from "~/services/webhook-processor.server";
import {
  evaluateTransactionFailure,
  evaluateAbandonedCheckout,
} from "~/services/decline-detection.server";
import {
  promoteReadyCases,
  suppressCase,
  recoverCase,
  expireOldCases,
} from "~/services/recovery-workflow.server";
import { processRecoveryMessage } from "~/services/recovery-send.server";

// --- Import mocked functions (for configuration + assertions) ---
import { markEventProcessed } from "~/models/webhook-event.server";
import { createPaymentSignal } from "~/models/payment-signal.server";
import {
  createRecoveryCase,
  findOpenCaseForOrder,
  findOpenCaseForCheckout,
  transitionCaseStatus,
  getCasesReadyForMessaging,
  getExpiredCandidates,
} from "~/models/recovery-case.server";
import {
  createRecoveryMessage,
  markMessageSent,
  cancelPendingMessages,
} from "~/models/recovery-message.server";
import { findShopById } from "~/models/shop.server";
import { isPhoneOptedOut } from "~/models/sms-opt-out.server";
import { sendRecoveryEmail } from "~/services/email.server";
import { sendRecoverySMS } from "~/services/sms.server";
import { upsertCheckout } from "~/models/checkout.server";
import { upsertOrder, markOrderPaid } from "~/models/order.server";

// --- Factories ---

const SMS_SHOP_SETTINGS = {
  smsEnabled: true,
  channelSequence: ["SMS", "EMAIL", "EMAIL"],
};

function buildWebhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    shopId: 1,
    topic: "order_transactions/create",
    eventId: "evt-123",
    payloadJson: {
      id: "txn-456",
      status: "failure",
      kind: "sale",
      error_code: "insufficient_funds",
      gateway: "stripe",
      amount: "99.99",
      currency: "USD",
      order_id: "123",
      processed_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  };
}

function buildShop(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    shopDomain: "test-shop.myshopify.com",
    settingsJson: SMS_SHOP_SETTINGS,
    ...overrides,
  };
}

function buildCheckout(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    shopId: 1,
    email: "customer@example.com",
    phone: "+15551234567",
    recoveryUrl: "https://shop.example.com/checkout/recover/abc123",
    ...overrides,
  };
}

function buildRecoveryCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    shopId: 1,
    caseType: CaseType.CONFIRMED_DECLINE,
    caseStatus: CaseStatus.CANDIDATE,
    confidenceScore: 80,
    openedAt: new Date("2026-01-01"),
    suppressionUntil: new Date("2026-01-01"),
    ...overrides,
  };
}

function buildRecoveryMessage(
  overrides: Record<string, unknown> = {},
  checkoutOverrides: Record<string, unknown> = {},
  shopOverrides: Record<string, unknown> = {},
  caseOverrides: Record<string, unknown> = {}
) {
  const shop = buildShop(shopOverrides);
  const checkout = buildCheckout(checkoutOverrides);
  const recoveryCase = buildRecoveryCase({
    caseStatus: CaseStatus.MESSAGING,
    checkout,
    shop,
    ...caseOverrides,
  });

  return {
    id: 1,
    channel: Channel.SMS,
    sequenceStep: 1,
    sentAt: null,
    deliveryStatus: "pending",
    recoveryCase,
    ...overrides,
  };
}

// --- Tests ---

describe("SMS Recovery Flow - Integration Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = "https://app.example.com";

    // Defaults for model mocks that return void
    vi.mocked(markEventProcessed).mockResolvedValue(undefined as never);
    vi.mocked(transitionCaseStatus).mockResolvedValue(undefined as never);
    vi.mocked(markMessageSent).mockResolvedValue(undefined as never);
    vi.mocked(cancelPendingMessages).mockResolvedValue(undefined as never);
    vi.mocked(createPaymentSignal).mockResolvedValue(undefined as never);
    vi.mocked(isPhoneOptedOut).mockResolvedValue(false);
    vi.mocked(sendRecoverySMS).mockResolvedValue("SM-integration-001");
    vi.mocked(sendRecoveryEmail).mockResolvedValue("email-integration-001");
    vi.mocked(findOpenCaseForCheckout).mockResolvedValue(null);
    vi.mocked(getExpiredCandidates).mockResolvedValue([]);
    vi.mocked(upsertCheckout).mockResolvedValue(undefined as never);
    vi.mocked(upsertOrder).mockResolvedValue(undefined as never);
    vi.mocked(markOrderPaid).mockResolvedValue(undefined as never);
    mockQueueAdd.mockResolvedValue(undefined);
  });

  describe("end-to-end: transaction failure → decline → promote → SMS sent", () => {
    it("processes the full pipeline from webhook to SMS delivery", async () => {
      // --- Phase 1: Webhook processing ---
      mockWebhookFindUnique.mockResolvedValue(buildWebhookEvent());

      await processWebhookEvent({
        webhookEventId: 1,
        shopId: 1,
        topic: "order_transactions/create",
      });

      expect(vi.mocked(createPaymentSignal)).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 1,
          signalType: SignalType.TRANSACTION_FAILURE,
          shopifyOrderGid: "gid://shopify/Order/123",
          errorCode: "insufficient_funds",
          gateway: "stripe",
        })
      );
      expect(vi.mocked(markEventProcessed)).toHaveBeenCalledWith(
        1,
        ProcessingStatus.PROCESSED
      );

      // --- Phase 2: Decline detection ---
      vi.mocked(findOpenCaseForOrder).mockResolvedValue(null);
      mockPaymentSignalFindFirst.mockResolvedValue(null);
      const recoveryCase = buildRecoveryCase();
      vi.mocked(createRecoveryCase).mockResolvedValue(recoveryCase as never);

      await evaluateTransactionFailure({
        shopId: 1,
        shopifyOrderGid: "gid://shopify/Order/123",
        errorCode: "insufficient_funds",
        gateway: "stripe",
      });

      expect(vi.mocked(createRecoveryCase)).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 1,
          caseType: CaseType.CONFIRMED_DECLINE,
          shopifyOrderGid: "gid://shopify/Order/123",
        })
      );

      // --- Phase 3: Case promotion + message scheduling ---
      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [recoveryCase] as never
      );
      vi.mocked(findShopById).mockResolvedValue(buildShop() as never);

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      await promoteReadyCases();

      // Verify case transitions: CANDIDATE → READY → MESSAGING
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
        10,
        CaseStatus.READY
      );
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
        10,
        CaseStatus.MESSAGING
      );

      // Verify 3 messages scheduled: step 1 = SMS, steps 2-3 = EMAIL
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledTimes(3);
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 10, channel: Channel.SMS, sequenceStep: 1 })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 10, channel: Channel.EMAIL, sequenceStep: 2 })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 10, channel: Channel.EMAIL, sequenceStep: 3 })
      );

      // Verify 3 queue jobs added
      expect(mockQueueAdd).toHaveBeenCalledTimes(3);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-10-step-1",
        expect.objectContaining({ recoveryMessageId: 1, recoveryCaseId: 10 }),
        expect.objectContaining({ delay: 15 * 60_000 })
      );

      // --- Phase 4: SMS send ---
      mockRecoveryMessageFindUnique.mockResolvedValue(buildRecoveryMessage());

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(isPhoneOptedOut)).toHaveBeenCalledWith("+15551234567");
      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "+15551234567",
          body: expect.stringContaining("https://app.example.com/r/10"),
        })
      );
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).toHaveBeenCalledWith(
        1,
        "SM-integration-001"
      );
    });
  });

  describe("SMS opt-out → email fallback", () => {
    it("falls back to email when customer phone is opted out", async () => {
      mockRecoveryMessageFindUnique.mockResolvedValue(buildRecoveryMessage());
      vi.mocked(isPhoneOptedOut).mockResolvedValue(true);

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "customer@example.com",
          recoveryUrl: "https://app.example.com/r/10",
        })
      );
      expect(vi.mocked(markMessageSent)).toHaveBeenCalledWith(
        1,
        "email-integration-001"
      );
    });

    it("drops message when opted out and no email available", async () => {
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage({}, { email: null })
      );
      vi.mocked(isPhoneOptedOut).mockResolvedValue(true);

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).not.toHaveBeenCalled();
    });
  });

  describe("missing phone → email fallback", () => {
    it("falls back to email when SMS channel has no phone number", async () => {
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage({}, { phone: null })
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(isPhoneOptedOut)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledWith(
        expect.objectContaining({ to: "customer@example.com" })
      );
      expect(vi.mocked(markMessageSent)).toHaveBeenCalledWith(
        1,
        "email-integration-001"
      );
    });

    it("drops message when both phone and email are missing", async () => {
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage({}, { phone: null, email: null })
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).not.toHaveBeenCalled();
    });
  });

  describe("channel routing", () => {
    it("assigns per-step channels based on merchant configuration", async () => {
      const customSettings = {
        smsEnabled: true,
        channelSequence: ["SMS", "EMAIL", "SMS"],
      };
      const recoveryCase = buildRecoveryCase();
      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [recoveryCase] as never
      );
      vi.mocked(findShopById).mockResolvedValue(
        buildShop({ settingsJson: customSettings }) as never
      );

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      await promoteReadyCases();

      const calls = vi.mocked(createRecoveryMessage).mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0]).toEqual(
        expect.objectContaining({ sequenceStep: 1, channel: Channel.SMS })
      );
      expect(calls[1][0]).toEqual(
        expect.objectContaining({ sequenceStep: 2, channel: Channel.EMAIL })
      );
      expect(calls[2][0]).toEqual(
        expect.objectContaining({ sequenceStep: 3, channel: Channel.SMS })
      );
    });

    it("forces all steps to EMAIL when SMS is disabled", async () => {
      const recoveryCase = buildRecoveryCase();
      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [recoveryCase] as never
      );
      vi.mocked(findShopById).mockResolvedValue(
        buildShop({
          settingsJson: {
            smsEnabled: false,
            channelSequence: ["SMS", "SMS", "SMS"],
          },
        }) as never
      );

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      await promoteReadyCases();

      const calls = vi.mocked(createRecoveryMessage).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ channel: Channel.EMAIL })
        );
      }
    });

    it("uses merchant-configured retry delays for scheduling", async () => {
      const recoveryCase = buildRecoveryCase();
      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [recoveryCase] as never
      );
      vi.mocked(findShopById).mockResolvedValue(
        buildShop({
          settingsJson: {
            smsEnabled: true,
            channelSequence: ["SMS", "EMAIL"],
            retryDelays: [5, 60],
          },
        }) as never
      );

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      await promoteReadyCases();

      // Only 2 messages for 2 retry delays
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledTimes(2);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 5 * 60_000 })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 60 * 60_000 })
      );
    });
  });

  describe("suppression interrupts recovery", () => {
    it("cancels pending messages and transitions case to SUPPRESSED", async () => {
      await suppressCase(10, "order_paid");

      expect(vi.mocked(cancelPendingMessages)).toHaveBeenCalledWith(10);
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
        10,
        CaseStatus.SUPPRESSED,
        "order_paid"
      );
    });

    it("does not send messages for suppressed cases", async () => {
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          {},
          {},
          {},
          { caseStatus: CaseStatus.SUPPRESSED }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).not.toHaveBeenCalled();
    });
  });

  describe("decline detection guards", () => {
    it("skips case creation when a success signal already exists", async () => {
      vi.mocked(findOpenCaseForOrder).mockResolvedValue(null);
      mockPaymentSignalFindFirst.mockResolvedValue({
        id: 99,
        signalType: SignalType.TRANSACTION_SUCCESS,
      });

      await evaluateTransactionFailure({
        shopId: 1,
        shopifyOrderGid: "gid://shopify/Order/123",
      });

      expect(vi.mocked(createRecoveryCase)).not.toHaveBeenCalled();
    });

    it("skips case creation when an open case already exists", async () => {
      vi.mocked(findOpenCaseForOrder).mockResolvedValue(
        buildRecoveryCase() as never
      );

      await evaluateTransactionFailure({
        shopId: 1,
        shopifyOrderGid: "gid://shopify/Order/123",
      });

      expect(vi.mocked(createRecoveryCase)).not.toHaveBeenCalled();
      expect(mockPaymentSignalFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("SMS template substitution", () => {
    it("injects recovery URL into merchant SMS template", async () => {
      const customTemplate = {
        smsEnabled: true,
        channelSequence: ["SMS"],
        smsTemplates: {
          confirmedDecline: {
            body: "Hey! Your order is waiting: {{recovery_url}} — don't miss out!",
          },
        },
      };

      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage({}, {}, { settingsJson: customTemplate })
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "Hey! Your order is waiting: https://app.example.com/r/10 — don't miss out!",
      });
    });
  });

  describe("end-to-end: abandoned checkout → LIKELY_ABANDONMENT → promote → email sent", () => {
    it("processes the full pipeline for abandoned checkout recovery via email", async () => {
      // --- Phase 1: Abandoned checkout detection ---
      const abandonmentCase = buildRecoveryCase({
        id: 20,
        caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
        checkoutId: 200,
      });
      vi.mocked(createRecoveryCase).mockResolvedValue(abandonmentCase as never);

      await evaluateAbandonedCheckout({
        shopId: 1,
        checkoutId: 200,
        hasContactInfo: true,
        hasShippingInfo: true,
        totalAmount: 59.99,
      });

      expect(vi.mocked(findOpenCaseForCheckout)).toHaveBeenCalledWith(1, 200);
      expect(vi.mocked(createRecoveryCase)).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 1,
          checkoutId: 200,
          caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
        })
      );

      // --- Phase 2: Case promotion with email-only settings ---
      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [abandonmentCase] as never
      );
      vi.mocked(findShopById).mockResolvedValue(
        buildShop({
          settingsJson: {
            smsEnabled: false,
            channelSequence: ["EMAIL", "EMAIL", "EMAIL"],
          },
        }) as never
      );

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      await promoteReadyCases();

      // All 3 messages should be EMAIL for email-only config
      const calls = vi.mocked(createRecoveryMessage).mock.calls;
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ recoveryCaseId: 20, channel: Channel.EMAIL })
        );
      }

      // --- Phase 3: Email delivery ---
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 1, channel: Channel.EMAIL, sequenceStep: 1 },
          {},
          {},
          {
            id: 20,
            caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
            caseStatus: CaseStatus.MESSAGING,
          }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 20 });

      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "customer@example.com",
          recoveryUrl: "https://app.example.com/r/20",
        })
      );
      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
    });
  });

  describe("end-to-end: LIKELY_ABANDONMENT with SMS-first channel", () => {
    it("sends SMS with likelyAbandonment template for abandoned checkout", async () => {
      const smsSettings = {
        smsEnabled: true,
        channelSequence: ["SMS", "EMAIL", "EMAIL"],
        smsTemplates: {
          likelyAbandonment: {
            body: "Don't forget your items! Finish checkout: {{recovery_url}}",
          },
        },
      };

      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 1, channel: Channel.SMS, sequenceStep: 1 },
          {},
          { settingsJson: smsSettings },
          {
            id: 20,
            caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
            caseStatus: CaseStatus.MESSAGING,
          }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 20 });

      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "Don't forget your items! Finish checkout: https://app.example.com/r/20",
      });
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
    });
  });

  describe("batch promotion: multiple cases with different shop settings", () => {
    it("promotes multiple cases from different shops with correct channels", async () => {
      const case1 = buildRecoveryCase({ id: 10, shopId: 1 });
      const case2 = buildRecoveryCase({ id: 11, shopId: 2 });
      const case3 = buildRecoveryCase({ id: 12, shopId: 1 });

      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [case1, case2, case3] as never
      );

      // Shop 1: SMS-first
      // Shop 2: email-only
      vi.mocked(findShopById).mockImplementation((id: number) => {
        if (id === 1) {
          return Promise.resolve(
            buildShop({
              id: 1,
              settingsJson: { smsEnabled: true, channelSequence: ["SMS", "EMAIL", "EMAIL"] },
            }) as never
          );
        }
        return Promise.resolve(
          buildShop({
            id: 2,
            settingsJson: { smsEnabled: false, channelSequence: ["SMS", "SMS", "SMS"] },
          }) as never
        );
      });

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      const promoted = await promoteReadyCases();
      expect(promoted).toBe(3);

      // 3 cases × 3 steps = 9 messages total
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledTimes(9);

      // Case 10 (shop 1, SMS-enabled): step 1 = SMS, steps 2-3 = EMAIL
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 10, sequenceStep: 1, channel: Channel.SMS })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 10, sequenceStep: 2, channel: Channel.EMAIL })
      );

      // Case 11 (shop 2, SMS-disabled): all EMAIL despite channelSequence
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 11, sequenceStep: 1, channel: Channel.EMAIL })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 11, sequenceStep: 2, channel: Channel.EMAIL })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 11, sequenceStep: 3, channel: Channel.EMAIL })
      );

      // Case 12 (shop 1, SMS-enabled): step 1 = SMS
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 12, sequenceStep: 1, channel: Channel.SMS })
      );

      // 9 queue jobs added
      expect(mockQueueAdd).toHaveBeenCalledTimes(9);

      // All 3 cases should transition to MESSAGING
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(10, CaseStatus.MESSAGING);
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(11, CaseStatus.MESSAGING);
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(12, CaseStatus.MESSAGING);
    });
  });

  describe("multi-step delivery: SMS step 1 then EMAIL step 2", () => {
    it("sends SMS for step 1 and email for step 2 of the same case", async () => {
      // --- Step 1: SMS ---
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 1, channel: Channel.SMS, sequenceStep: 1 },
          {},
          {},
          { caseStatus: CaseStatus.MESSAGING }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+15551234567" })
      );
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).toHaveBeenCalledWith(1, "SM-integration-001");

      // Reset for step 2
      vi.mocked(sendRecoverySMS).mockClear();
      vi.mocked(sendRecoveryEmail).mockClear();
      vi.mocked(markMessageSent).mockClear();

      // --- Step 2: EMAIL ---
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 2, channel: Channel.EMAIL, sequenceStep: 2 },
          {},
          {},
          { caseStatus: CaseStatus.MESSAGING }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 2, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledWith(
        expect.objectContaining({ to: "customer@example.com" })
      );
      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).toHaveBeenCalledWith(2, "email-integration-001");
    });
  });

  describe("recovery lifecycle: order paid → case recovered", () => {
    it("cancels pending messages and marks case as RECOVERED", async () => {
      await recoverCase(10);

      expect(vi.mocked(cancelPendingMessages)).toHaveBeenCalledWith(10);
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
        10,
        CaseStatus.RECOVERED,
        "order_paid"
      );
    });

    it("prevents subsequent messages from being sent after recovery", async () => {
      await recoverCase(10);

      // Step 2 message arrives after recovery
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 2, channel: Channel.EMAIL, sequenceStep: 2 },
          {},
          {},
          { caseStatus: CaseStatus.RECOVERED }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 2, recoveryCaseId: 10 });

      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
      expect(vi.mocked(sendRecoveryEmail)).not.toHaveBeenCalled();
      expect(vi.mocked(markMessageSent)).not.toHaveBeenCalled();
    });
  });

  describe("expiration lifecycle: expired candidates cleaned up", () => {
    it("expires multiple old cases in a single batch", async () => {
      const expiredCases = [
        buildRecoveryCase({ id: 30, caseStatus: CaseStatus.CANDIDATE }),
        buildRecoveryCase({ id: 31, caseStatus: CaseStatus.READY }),
        buildRecoveryCase({ id: 32, caseStatus: CaseStatus.MESSAGING }),
      ];

      vi.mocked(getExpiredCandidates).mockResolvedValue(expiredCases as never);

      const count = await expireOldCases();
      expect(count).toBe(3);

      // Each case gets pending messages cancelled + status transitioned
      for (const c of expiredCases) {
        expect(vi.mocked(cancelPendingMessages)).toHaveBeenCalledWith(c.id);
        expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
          c.id,
          CaseStatus.EXPIRED,
          "ttl_exceeded"
        );
      }
    });

    it("returns 0 when no expired cases exist", async () => {
      vi.mocked(getExpiredCandidates).mockResolvedValue([]);

      const count = await expireOldCases();
      expect(count).toBe(0);

      expect(vi.mocked(cancelPendingMessages)).not.toHaveBeenCalled();
      expect(vi.mocked(transitionCaseStatus)).not.toHaveBeenCalled();
    });
  });

  describe("order-paid webhook → payment signal + suppression", () => {
    it("processes orders/paid webhook and then suppresses the recovery case", async () => {
      // --- Phase 1: Webhook creates ORDER_PAID signal ---
      mockWebhookFindUnique.mockResolvedValue(
        buildWebhookEvent({
          id: 5,
          topic: "orders/paid",
          payloadJson: {
            id: "456",
            email: "customer@example.com",
          },
        })
      );

      await processWebhookEvent({
        webhookEventId: 5,
        shopId: 1,
        topic: "orders/paid",
      });

      expect(vi.mocked(markOrderPaid)).toHaveBeenCalledWith(
        "gid://shopify/Order/456"
      );
      expect(vi.mocked(createPaymentSignal)).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 1,
          shopifyOrderGid: "gid://shopify/Order/456",
          signalType: SignalType.ORDER_PAID,
          rawSourceTopic: "orders/paid",
        })
      );
      expect(vi.mocked(markEventProcessed)).toHaveBeenCalledWith(
        5,
        ProcessingStatus.PROCESSED
      );

      // --- Phase 2: Suppress the open recovery case ---
      await suppressCase(10, "order_paid");

      expect(vi.mocked(cancelPendingMessages)).toHaveBeenCalledWith(10);
      expect(vi.mocked(transitionCaseStatus)).toHaveBeenCalledWith(
        10,
        CaseStatus.SUPPRESSED,
        "order_paid"
      );
    });
  });

  describe("abandoned checkout detection guards", () => {
    it("skips case creation when no contact info", async () => {
      await evaluateAbandonedCheckout({
        shopId: 1,
        checkoutId: 200,
        hasContactInfo: false,
        hasShippingInfo: true,
        totalAmount: 59.99,
      });

      expect(vi.mocked(findOpenCaseForCheckout)).not.toHaveBeenCalled();
      expect(vi.mocked(createRecoveryCase)).not.toHaveBeenCalled();
    });

    it("skips case creation when total amount is zero", async () => {
      await evaluateAbandonedCheckout({
        shopId: 1,
        checkoutId: 200,
        hasContactInfo: true,
        hasShippingInfo: true,
        totalAmount: 0,
      });

      expect(vi.mocked(findOpenCaseForCheckout)).not.toHaveBeenCalled();
      expect(vi.mocked(createRecoveryCase)).not.toHaveBeenCalled();
    });

    it("skips case creation when open case already exists for checkout", async () => {
      vi.mocked(findOpenCaseForCheckout).mockResolvedValue(
        buildRecoveryCase({ checkoutId: 200 }) as never
      );

      await evaluateAbandonedCheckout({
        shopId: 1,
        checkoutId: 200,
        hasContactInfo: true,
        hasShippingInfo: true,
        totalAmount: 59.99,
      });

      expect(vi.mocked(createRecoveryCase)).not.toHaveBeenCalled();
    });
  });

  describe("multi-shop batch: different SMS configs processed together", () => {
    it("handles mixed SMS/email shops in a single promotion batch", async () => {
      const smsShopCase = buildRecoveryCase({ id: 40, shopId: 1 });
      const emailShopCase = buildRecoveryCase({
        id: 41,
        shopId: 2,
        caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
      });

      vi.mocked(getCasesReadyForMessaging).mockResolvedValue(
        [smsShopCase, emailShopCase] as never
      );

      vi.mocked(findShopById).mockImplementation((id: number) => {
        if (id === 1) {
          return Promise.resolve(
            buildShop({
              id: 1,
              settingsJson: {
                smsEnabled: true,
                channelSequence: ["SMS", "SMS", "EMAIL"],
                retryDelays: [10, 60],
              },
            }) as never
          );
        }
        return Promise.resolve(
          buildShop({
            id: 2,
            settingsJson: {
              smsEnabled: false,
              retryDelays: [30, 360, 1440],
            },
          }) as never
        );
      });

      let messageIdCounter = 0;
      vi.mocked(createRecoveryMessage).mockImplementation(() =>
        Promise.resolve({ id: ++messageIdCounter } as never)
      );

      const promoted = await promoteReadyCases();
      expect(promoted).toBe(2);

      // Shop 1: 2 steps (retryDelays [10, 60]) → SMS, SMS
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 40, sequenceStep: 1, channel: Channel.SMS })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 40, sequenceStep: 2, channel: Channel.SMS })
      );

      // Shop 2: 3 steps (retryDelays [30, 360, 1440]) → all EMAIL
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 41, sequenceStep: 1, channel: Channel.EMAIL })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 41, sequenceStep: 2, channel: Channel.EMAIL })
      );
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ recoveryCaseId: 41, sequenceStep: 3, channel: Channel.EMAIL })
      );

      // Verify correct delays for shop 1: 10min, 60min
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-40-step-1",
        expect.objectContaining({ recoveryCaseId: 40 }),
        expect.objectContaining({ delay: 10 * 60_000 })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-40-step-2",
        expect.objectContaining({ recoveryCaseId: 40 }),
        expect.objectContaining({ delay: 60 * 60_000 })
      );

      // Verify correct delays for shop 2: 30min, 360min, 1440min
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-41-step-1",
        expect.objectContaining({ recoveryCaseId: 41 }),
        expect.objectContaining({ delay: 30 * 60_000 })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-41-step-2",
        expect.objectContaining({ recoveryCaseId: 41 }),
        expect.objectContaining({ delay: 360 * 60_000 })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-41-step-3",
        expect.objectContaining({ recoveryCaseId: 41 }),
        expect.objectContaining({ delay: 1440 * 60_000 })
      );

      // 2 + 3 = 5 total messages and queue jobs
      expect(vi.mocked(createRecoveryMessage)).toHaveBeenCalledTimes(5);
      expect(mockQueueAdd).toHaveBeenCalledTimes(5);
    });

    it("sends correct templates when delivering messages from different shops", async () => {
      // Shop 1 message: CONFIRMED_DECLINE via SMS
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 1, channel: Channel.SMS, sequenceStep: 1 },
          {},
          {
            id: 1,
            settingsJson: {
              smsEnabled: true,
              channelSequence: ["SMS"],
              smsTemplates: {
                confirmedDecline: { body: "Shop1: Fix payment {{recovery_url}}" },
              },
            },
          },
          { id: 40, caseType: CaseType.CONFIRMED_DECLINE, caseStatus: CaseStatus.MESSAGING }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 1, recoveryCaseId: 40 });

      expect(vi.mocked(sendRecoverySMS)).toHaveBeenCalledWith({
        to: "+15551234567",
        body: "Shop1: Fix payment https://app.example.com/r/40",
      });

      vi.mocked(sendRecoverySMS).mockClear();
      vi.mocked(sendRecoveryEmail).mockClear();
      vi.mocked(markMessageSent).mockClear();

      // Shop 2 message: LIKELY_PAYMENT_STAGE_ABANDONMENT via EMAIL
      mockRecoveryMessageFindUnique.mockResolvedValue(
        buildRecoveryMessage(
          { id: 2, channel: Channel.EMAIL, sequenceStep: 1 },
          {},
          { id: 2, settingsJson: { smsEnabled: false } },
          {
            id: 41,
            caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
            caseStatus: CaseStatus.MESSAGING,
          }
        )
      );

      await processRecoveryMessage({ recoveryMessageId: 2, recoveryCaseId: 41 });

      expect(vi.mocked(sendRecoveryEmail)).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "customer@example.com",
          subject: "Looks like you didn't finish checking out",
          recoveryUrl: "https://app.example.com/r/41",
        })
      );
      expect(vi.mocked(sendRecoverySMS)).not.toHaveBeenCalled();
    });
  });
});
