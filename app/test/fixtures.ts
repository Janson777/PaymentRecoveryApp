import type {
  Checkout,
  RecoveryCase,
  RecoveryMessage,
  Shop,
  WebhookEvent,
} from "@prisma/client";
import { CaseStatus, CaseType, Channel } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────────
// Shared test fixture factories for recovery-flow integration tests.
//
// Design principles:
//   • Each factory accepts a `Partial<Model>` override bag (Model comes
//     from `@prisma/client`), so typos or wrong-type overrides are
//     caught at compile time against the real Prisma schema.
//   • The returned objects are intentionally PARTIAL representations —
//     we don't include required-but-unused fields like `accessTokenEncrypted`
//     or `createdAt` since no test reads them. Callers that pass these
//     objects into production code typed as the full Prisma model cast
//     with `as never` at the call site (see the integration test).
//   • `buildRecoveryMessage` composes the other factories so message
//     shapes always reflect a fully built relational object graph, and
//     its options bag layers `Partial<Model>` overrides for each layer
//     of the graph (`message` / `checkout` / `shop` / `recoveryCase`).
//   • `SMS_SHOP_SETTINGS` is exported for tests that want to assert
//     against or tweak the canonical default settings payload.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Canonical SMS-first merchant settings used as the default
 * `settingsJson` on `buildShop()`. Individual tests can pass
 * `buildShop({ settingsJson: { ... } })` to exercise other configurations.
 */
export const SMS_SHOP_SETTINGS = {
  smsEnabled: true,
  channelSequence: ["SMS", "EMAIL", "EMAIL"],
};

/**
 * Build a WebhookEvent-shaped object for integration tests that exercise
 * the webhook-processor pipeline. Defaults to a declined transaction
 * payload on the `order_transactions/create` topic.
 *
 * Returns a partial `WebhookEvent`; only the fields that the
 * webhook-processor actually reads are populated.
 */
export function buildWebhookEvent(overrides: Partial<WebhookEvent> = {}) {
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
  } satisfies Partial<WebhookEvent>;
}

/**
 * Build a Shop-shaped object for tests that mock `findShopById`.
 *
 * Defaults to `planTier: "PRO"` so plan-tier gating in
 * `scheduleRecoverySequence` (`getShopPlanTier` → FREE caps at
 * `maxSequenceSteps=2` and forces SMS → EMAIL via `isChannelAllowed`)
 * doesn't silently override the `channelSequence` that flow-level tests
 * assert against. Tests that specifically exercise plan-tier behavior
 * pass `{ planTier: "FREE" }` to invert the default.
 */
export function buildShop(overrides: Partial<Shop> = {}) {
  return {
    id: 1,
    shopDomain: "test-shop.myshopify.com",
    settingsJson: SMS_SHOP_SETTINGS,
    planTier: "PRO",
    ...overrides,
  } satisfies Partial<Shop>;
}

/**
 * Build a Checkout-shaped object with a valid email + phone + recovery URL.
 * Tests that exercise the phone/email fallback paths pass
 * `{ phone: null }` or `{ email: null }`.
 */
export function buildCheckout(overrides: Partial<Checkout> = {}) {
  return {
    id: 100,
    shopId: 1,
    email: "customer@example.com",
    phone: "+15551234567",
    recoveryUrl: "https://shop.example.com/checkout/recover/abc123",
    ...overrides,
  } satisfies Partial<Checkout>;
}

/**
 * Build a RecoveryCase-shaped object (defaults to a CANDIDATE
 * confirmed-decline case). Tests exercising SUPPRESSED / RECOVERED /
 * EXPIRED / READY / MESSAGING paths pass `{ caseStatus: ... }`.
 */
export function buildRecoveryCase(overrides: Partial<RecoveryCase> = {}) {
  return {
    id: 10,
    shopId: 1,
    caseType: CaseType.CONFIRMED_DECLINE,
    caseStatus: CaseStatus.CANDIDATE,
    confidenceScore: 80,
    openedAt: new Date("2026-01-01"),
    suppressionUntil: new Date("2026-01-01"),
    ...overrides,
  } satisfies Partial<RecoveryCase>;
}

/**
 * Options for {@link buildRecoveryMessage}. Each field is an independent
 * `Partial<Model>` override bag for one layer of the embedded relational
 * graph — pass only the ones you actually want to patch. Overrides are
 * type-checked against the real Prisma schema.
 */
export interface BuildRecoveryMessageOptions {
  /** Patches the top-level RecoveryMessage (id, channel, sequenceStep, etc.). */
  message?: Partial<RecoveryMessage>;
  /** Patches the embedded Checkout (email, phone, recoveryUrl, etc.). */
  checkout?: Partial<Checkout>;
  /** Patches the embedded Shop (settingsJson, planTier, id, etc.). */
  shop?: Partial<Shop>;
  /** Patches the embedded RecoveryCase (caseStatus, caseType, id, etc.). */
  recoveryCase?: Partial<RecoveryCase>;
}

/**
 * Build a RecoveryMessage-shaped object with a fully populated relational
 * graph (message → recoveryCase → { checkout, shop }). The embedded case
 * is force-set to `CaseStatus.MESSAGING` to reflect the state in which a
 * message would actually be dispatched — callers override via
 * `recoveryCase: { caseStatus: CaseStatus.SUPPRESSED }`, etc.
 *
 * Example:
 *
 * ```ts
 * buildRecoveryMessage({
 *   message: { id: 2, channel: Channel.EMAIL, sequenceStep: 2 },
 *   checkout: { phone: null },
 *   shop: { settingsJson: customSettings },
 *   recoveryCase: { caseStatus: CaseStatus.RECOVERED },
 * });
 * ```
 */
export function buildRecoveryMessage(
  options: BuildRecoveryMessageOptions = {}
) {
  // Rename the destructured overrides so the built objects can keep the
  // canonical domain names (`shop`, `checkout`, `recoveryCase`) — these
  // read more naturally in the return statement below.
  const {
    message,
    checkout: checkoutOverrides,
    shop: shopOverrides,
    recoveryCase: caseOverrides,
  } = options;

  const shop = buildShop(shopOverrides);
  const checkout = buildCheckout(checkoutOverrides);
  const recoveryCase = {
    ...buildRecoveryCase({
      caseStatus: CaseStatus.MESSAGING,
      ...(caseOverrides ?? {}),
    }),
    // Relational fields (not on the `RecoveryCase` Prisma model itself;
    // they appear when the model is fetched with `include: { checkout, shop }`).
    checkout,
    shop,
  };

  // Extract the top-level RecoveryMessage fields into a `base` literal so
  // they can be `satisfies Partial<RecoveryMessage>`-checked against the
  // real Prisma schema (catches drift like `deliveryStatus: "pending"`
  // becoming an enum). We can't satisfies-check the full return because it
  // includes a `recoveryCase` relation which is not on the base
  // `RecoveryMessage` Prisma type (only appears via `include`).
  const base = {
    id: 1,
    channel: Channel.SMS,
    sequenceStep: 1,
    sentAt: null,
    deliveryStatus: "pending",
    ...(message ?? {}),
  } satisfies Partial<RecoveryMessage>;

  return { ...base, recoveryCase };
}
