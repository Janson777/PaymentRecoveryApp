import { describe, it, expect } from "vitest";
import { CaseStatus, CaseType, Channel } from "@prisma/client";

import {
  SMS_SHOP_SETTINGS,
  buildWebhookEvent,
  buildShop,
  buildCheckout,
  buildRecoveryCase,
  buildRecoveryMessage,
} from "~/test/fixtures";

// ────────────────────────────────────────────────────────────────────────────
// These tests lock in the baseline shapes + override-merging semantics of
// the shared fixture factories. They exist to catch accidental regressions
// like:
//   • dropping the `planTier: "PRO"` default on `buildShop()` (would flip
//     every integration test into FREE-tier gating)
//   • forgetting to spread overrides last (would make overrides no-ops)
//   • breaking the layered structure of `buildRecoveryMessage` (shop +
//     checkout embedded in the recoveryCase)
// ────────────────────────────────────────────────────────────────────────────

describe("SMS_SHOP_SETTINGS", () => {
  it("exports the canonical SMS-first settings shape", () => {
    expect(SMS_SHOP_SETTINGS).toEqual({
      smsEnabled: true,
      channelSequence: ["SMS", "EMAIL", "EMAIL"],
    });
  });
});

describe("buildWebhookEvent", () => {
  it("returns sensible defaults for a declined transaction event", () => {
    const event = buildWebhookEvent();

    expect(event).toMatchObject({
      id: 1,
      shopId: 1,
      topic: "order_transactions/create",
      eventId: "evt-123",
    });
    expect(event.payloadJson).toMatchObject({
      status: "failure",
      kind: "sale",
      error_code: "insufficient_funds",
      gateway: "stripe",
    });
  });

  it("applies top-level overrides (e.g. topic change for orders/paid tests)", () => {
    const event = buildWebhookEvent({
      id: 5,
      topic: "orders/paid",
      eventId: "evt-paid-5",
    });

    expect(event.id).toBe(5);
    expect(event.topic).toBe("orders/paid");
    expect(event.eventId).toBe("evt-paid-5");
    // Unspecified defaults are preserved.
    expect(event.shopId).toBe(1);
  });

  it("replaces payloadJson wholesale when overridden (not deep-merged)", () => {
    // This is the historical behavior — documenting it so callers don't
    // expect a deep merge on nested objects.
    const event = buildWebhookEvent({
      payloadJson: { id: "456", email: "customer@example.com" },
    });

    expect(event.payloadJson).toEqual({
      id: "456",
      email: "customer@example.com",
    });
  });
});

describe("buildShop", () => {
  it("defaults to a PRO shop with SMS-first settings (plan-tier regression guard)", () => {
    // Flipping the `planTier` default to anything other than "PRO" would
    // silently break every integration test that doesn't explicitly
    // exercise FREE-tier gating. The plan-tier regression block in
    // `sms-recovery-flow.integration.test.ts` depends on this default.
    expect(buildShop()).toEqual({
      id: 1,
      shopDomain: "test-shop.myshopify.com",
      settingsJson: SMS_SHOP_SETTINGS,
      planTier: "PRO",
    });
  });

  it("applies planTier override for FREE-tier gating tests", () => {
    const shop = buildShop({ planTier: "FREE" });
    expect(shop.planTier).toBe("FREE");
    // Other defaults still intact.
    expect(shop.shopDomain).toBe("test-shop.myshopify.com");
    expect(shop.settingsJson).toEqual(SMS_SHOP_SETTINGS);
  });

  it("applies settingsJson override (replaces SMS_SHOP_SETTINGS wholesale)", () => {
    const custom = { smsEnabled: false, channelSequence: ["EMAIL"] };
    const shop = buildShop({ settingsJson: custom });
    expect(shop.settingsJson).toEqual(custom);
  });

  it("applies multiple overrides simultaneously", () => {
    const shop = buildShop({ id: 42, shopDomain: "other.myshopify.com" });
    expect(shop.id).toBe(42);
    expect(shop.shopDomain).toBe("other.myshopify.com");
    expect(shop.planTier).toBe("PRO");
  });
});

describe("buildCheckout", () => {
  it("defaults to a well-formed checkout with email + phone", () => {
    expect(buildCheckout()).toEqual({
      id: 100,
      shopId: 1,
      email: "customer@example.com",
      phone: "+15551234567",
      recoveryUrl: "https://shop.example.com/checkout/recover/abc123",
    });
  });

  it("allows null overrides for phone/email fallback tests", () => {
    const checkout = buildCheckout({ phone: null, email: null });
    expect(checkout.phone).toBeNull();
    expect(checkout.email).toBeNull();
    // recoveryUrl still intact.
    expect(checkout.recoveryUrl).toContain("checkout/recover");
  });
});

describe("buildRecoveryCase", () => {
  it("defaults to a CANDIDATE confirmed-decline case", () => {
    const recoveryCase = buildRecoveryCase();

    expect(recoveryCase).toMatchObject({
      id: 10,
      shopId: 1,
      caseType: CaseType.CONFIRMED_DECLINE,
      caseStatus: CaseStatus.CANDIDATE,
      confidenceScore: 80,
    });
    expect(recoveryCase.openedAt).toBeInstanceOf(Date);
    expect(recoveryCase.suppressionUntil).toBeInstanceOf(Date);
  });

  it("applies caseStatus overrides for state-machine tests", () => {
    const expired = buildRecoveryCase({ caseStatus: CaseStatus.EXPIRED });
    expect(expired.caseStatus).toBe(CaseStatus.EXPIRED);
    // Unrelated defaults still intact.
    expect(expired.caseType).toBe(CaseType.CONFIRMED_DECLINE);
  });

  it("applies caseType and checkoutId overrides for abandonment tests", () => {
    const abandonment = buildRecoveryCase({
      caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
      checkoutId: 200,
    });
    expect(abandonment.caseType).toBe(
      CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT
    );
    expect(abandonment.checkoutId).toBe(200);
  });
});

describe("buildRecoveryMessage", () => {
  it("defaults to an SMS message embedding a PRO shop + well-formed checkout + MESSAGING case", () => {
    const message = buildRecoveryMessage();

    expect(message).toMatchObject({
      id: 1,
      channel: Channel.SMS,
      sequenceStep: 1,
      sentAt: null,
      deliveryStatus: "pending",
    });

    // Embedded recoveryCase is forced to MESSAGING (the only state in
    // which a message would actually be dispatched).
    expect(message.recoveryCase.caseStatus).toBe(CaseStatus.MESSAGING);
    expect(message.recoveryCase.caseType).toBe(CaseType.CONFIRMED_DECLINE);

    // Embedded shop + checkout use the canonical defaults.
    expect(message.recoveryCase.shop).toMatchObject({
      planTier: "PRO",
      settingsJson: SMS_SHOP_SETTINGS,
    });
    expect(message.recoveryCase.checkout).toMatchObject({
      email: "customer@example.com",
      phone: "+15551234567",
    });
  });

  it("applies `message` overrides (e.g. channel + sequenceStep for step-2 tests)", () => {
    const message = buildRecoveryMessage({
      message: { id: 2, channel: Channel.EMAIL, sequenceStep: 2 },
    });

    expect(message.id).toBe(2);
    expect(message.channel).toBe(Channel.EMAIL);
    expect(message.sequenceStep).toBe(2);
  });

  it("applies `checkout` overrides into the embedded checkout only", () => {
    const message = buildRecoveryMessage({
      checkout: { phone: null },
    });

    expect(message.recoveryCase.checkout.phone).toBeNull();
    // Email still defaults.
    expect(message.recoveryCase.checkout.email).toBe("customer@example.com");
  });

  it("applies `shop` overrides into the embedded shop only", () => {
    const customSettings = { smsEnabled: false, channelSequence: ["EMAIL"] };
    const message = buildRecoveryMessage({
      shop: { settingsJson: customSettings },
    });

    expect(message.recoveryCase.shop.settingsJson).toEqual(customSettings);
    // planTier default preserved.
    expect(message.recoveryCase.shop.planTier).toBe("PRO");
  });

  it("applies `recoveryCase` overrides (e.g. caseStatus for suppression tests)", () => {
    const message = buildRecoveryMessage({
      recoveryCase: { caseStatus: CaseStatus.SUPPRESSED },
    });

    expect(message.recoveryCase.caseStatus).toBe(CaseStatus.SUPPRESSED);
    // Default caseType unchanged.
    expect(message.recoveryCase.caseType).toBe(CaseType.CONFIRMED_DECLINE);
  });

  it("applies multiple override layers in a single call", () => {
    const message = buildRecoveryMessage({
      message: { id: 2, channel: Channel.EMAIL, sequenceStep: 1 },
      shop: { id: 2, settingsJson: { smsEnabled: false } },
      recoveryCase: {
        id: 41,
        caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
        caseStatus: CaseStatus.MESSAGING,
      },
    });

    expect(message.id).toBe(2);
    expect(message.channel).toBe(Channel.EMAIL);
    expect(message.recoveryCase.id).toBe(41);
    expect(message.recoveryCase.caseType).toBe(
      CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT
    );
    expect(message.recoveryCase.shop.id).toBe(2);
  });

  it("allows `recoveryCase` overrides to escape the MESSAGING default (e.g. RECOVERED for post-recovery tests)", () => {
    const message = buildRecoveryMessage({
      recoveryCase: { caseStatus: CaseStatus.RECOVERED },
    });

    expect(message.recoveryCase.caseStatus).toBe(CaseStatus.RECOVERED);
  });
});
