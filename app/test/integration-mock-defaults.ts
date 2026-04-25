import type { Mock } from "vitest";
import { vi } from "vitest";

// Model + service functions that integration tests `vi.mock()` at the top of
// their file. Importing them here lets us call `vi.mocked(fn)` on the same
// module instance — the caller's `vi.mock(...)` declaration is what actually
// replaces the implementation, this file just configures return values.
import { markEventProcessed } from "~/models/webhook-event.server";
import { createPaymentSignal } from "~/models/payment-signal.server";
import {
  transitionCaseStatus,
  findOpenCaseForCheckout,
  getExpiredCandidates,
} from "~/models/recovery-case.server";
import {
  markMessageSent,
  markSmsMessageSentWithMetering,
  cancelPendingMessages,
} from "~/models/recovery-message.server";
import { findShopById } from "~/models/shop.server";
import { isPhoneOptedOut } from "~/models/sms-opt-out.server";
import { sendRecoveryEmail } from "~/services/email.server";
import { sendRecoverySMS } from "~/services/sms.server";
import type { SmsSendResult } from "~/services/sms.server";
import { upsertCheckout } from "~/models/checkout.server";
import { upsertOrder, markOrderPaid } from "~/models/order.server";

/**
 * Hoisted Prisma mocks declared locally in each integration test file
 * (via `vi.hoisted(...)`). Each test file that wants a specific Prisma
 * table method mocked passes the corresponding `Mock` instance here so
 * `applyIntegrationMockDefaults` can set a sensible baseline return value.
 *
 * All fields are optional — only pass the ones your file declared.
 */
export interface PrismaMockDefaults {
  /** `prisma.recoveryCase.count` — used by `canCreateCase` plan-tier gate. */
  recoveryCaseCount?: Mock;
  /** BullMQ recovery-queue `add` method. */
  queueAdd?: Mock;
}

export interface IntegrationMockDefaultsOptions {
  /**
   * The default shop object returned from `findShopById(...)`. Callers
   * typically pass their `buildShop()` factory result here. The shop
   * should include `planTier: "PRO"` unless the calling test file is
   * specifically exercising FREE-tier gating behavior end-to-end.
   */
  shop: unknown;

  /**
   * Override the default `sendRecoverySMS` return value. Defaults to a
   * minimal "sent" response with `sid: "SM-integration-001"` and null
   * metering fields. Uses the real `SmsSendResult` shape from the sms
   * service to keep test fixtures honest (e.g. `countryCode` must be
   * `"US" | "CA"`).
   */
  smsSendResult?: SmsSendResult;

  /** Override the default `sendRecoveryEmail` provider message id. */
  emailSendResult?: string;

  /** Hoisted Prisma mocks that should be reset to baseline return values. */
  prismaMocks?: PrismaMockDefaults;
}

/**
 * Apply baseline mock return values for the recovery-flow integration
 * test suite. Call from inside `beforeEach()` AFTER `vi.resetAllMocks()`
 * (or equivalent), and AFTER your `vi.mock(...)` declarations at the
 * module top.
 *
 * Each field defaults to the "happy path": no existing cases, no
 * opt-outs, no expired candidates, successful sends, a PRO shop, and a
 * 0-count monthly cap (if `prismaMocks.recoveryCaseCount` is passed).
 *
 * Individual tests are expected to override specific mocks as needed —
 * for instance, setting `findOpenCaseForCheckout` to an existing case
 * to exercise the "already open" guard.
 */
export function applyIntegrationMockDefaults(
  options: IntegrationMockDefaultsOptions
): void {
  const {
    shop,
    smsSendResult,
    emailSendResult,
    prismaMocks,
  } = options;

  // Void-returning model writes: default to resolving undefined.
  vi.mocked(markEventProcessed).mockResolvedValue(undefined as never);
  vi.mocked(transitionCaseStatus).mockResolvedValue(undefined as never);
  vi.mocked(markMessageSent).mockResolvedValue(undefined as never);
  vi.mocked(markSmsMessageSentWithMetering).mockResolvedValue(
    undefined as never
  );
  vi.mocked(cancelPendingMessages).mockResolvedValue(undefined as never);
  vi.mocked(createPaymentSignal).mockResolvedValue(undefined as never);
  vi.mocked(upsertCheckout).mockResolvedValue(undefined as never);
  vi.mocked(upsertOrder).mockResolvedValue(undefined as never);
  vi.mocked(markOrderPaid).mockResolvedValue(undefined as never);

  // Query defaults: happy-path "nothing found".
  vi.mocked(isPhoneOptedOut).mockResolvedValue(false);
  vi.mocked(findOpenCaseForCheckout).mockResolvedValue(null);
  vi.mocked(getExpiredCandidates).mockResolvedValue([]);

  // External send results: tests overwrite these when asserting on payload.
  // The annotated type forces `countryCode: "US"` to narrow to the
  // `"US" | "CA"` literal of `SmsSendResult`.
  const defaultSmsSendResult: SmsSendResult = {
    sid: "SM-integration-001",
    numSegments: null,
    priceUsdCents: null,
    countryCode: "US",
  };
  vi.mocked(sendRecoverySMS).mockResolvedValue(
    smsSendResult ?? defaultSmsSendResult
  );
  vi.mocked(sendRecoveryEmail).mockResolvedValue(
    emailSendResult ?? "email-integration-001"
  );

  // Plan-tier gate default: PRO shop so `evaluateTransactionFailure` /
  // `evaluateAbandonedCheckout` pass the `findShopById + canCreateCase`
  // check. Individual tests override with `buildShop({ planTier: "FREE" })`
  // when specifically exercising the gate.
  vi.mocked(findShopById).mockResolvedValue(shop as never);

  // Hoisted-mock defaults — only touch the ones the caller actually
  // declared. Passing `undefined` is a silent no-op.
  prismaMocks?.recoveryCaseCount?.mockResolvedValue(0);
  prismaMocks?.queueAdd?.mockResolvedValue(undefined);
}
