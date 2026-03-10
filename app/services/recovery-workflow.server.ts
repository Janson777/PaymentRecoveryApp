import { CaseStatus, CaseType, Channel } from "@prisma/client";
import type { RecoveryCase } from "@prisma/client";
import {
  transitionCaseStatus,
  getCasesReadyForMessaging,
  getExpiredCandidates,
} from "~/models/recovery-case.server";
import {
  createRecoveryMessage,
  cancelPendingMessages,
} from "~/models/recovery-message.server";
import { getRecoveryQueue } from "~/queues/recovery.server";
import { findShopById } from "~/models/shop.server";
import { parseShopSettings, getChannelForStep } from "~/lib/settings";

const DEFAULT_DELAYS_MS = [
  15 * 60_000,    // Step 1: T+15 minutes
  12 * 3_600_000, // Step 2: T+12 hours
  36 * 3_600_000, // Step 3: T+36 hours
];

export async function promoteReadyCases(): Promise<number> {
  const cases = await getCasesReadyForMessaging();
  let promoted = 0;

  for (const recoveryCase of cases) {
    await transitionCaseStatus(recoveryCase.id, CaseStatus.READY);
    await scheduleRecoverySequence(recoveryCase);
    promoted++;
  }

  return promoted;
}

async function scheduleRecoverySequence(
  recoveryCase: RecoveryCase
): Promise<void> {
  const shop = await findShopById(recoveryCase.shopId);
  const settings = parseShopSettings(shop?.settingsJson);
  const queue = getRecoveryQueue();
  const now = Date.now();

  const delays =
    settings.retryDelays.length > 0
      ? settings.retryDelays.map((m) => m * 60_000)
      : DEFAULT_DELAYS_MS;

  for (let step = 0; step < delays.length; step++) {
    const channel =
      getChannelForStep(settings, step) === "SMS"
        ? Channel.SMS
        : Channel.EMAIL;

    const scheduledFor = new Date(now + delays[step]);

    const message = await createRecoveryMessage({
      recoveryCaseId: recoveryCase.id,
      channel,
      sequenceStep: step + 1,
      scheduledFor,
    });

    await queue.add(
      `recovery-${recoveryCase.id}-step-${step + 1}`,
      {
        recoveryMessageId: message.id,
        recoveryCaseId: recoveryCase.id,
      },
      { delay: delays[step] }
    );
  }

  await transitionCaseStatus(recoveryCase.id, CaseStatus.MESSAGING);
}

export async function suppressCase(
  caseId: number,
  reason: string
): Promise<void> {
  await cancelPendingMessages(caseId);
  await transitionCaseStatus(caseId, CaseStatus.SUPPRESSED, reason);
}

export async function recoverCase(caseId: number): Promise<void> {
  await cancelPendingMessages(caseId);
  await transitionCaseStatus(caseId, CaseStatus.RECOVERED, "order_paid");
}

export async function cancelCase(
  caseId: number,
  reason: string
): Promise<void> {
  await cancelPendingMessages(caseId);
  await transitionCaseStatus(caseId, CaseStatus.CANCELLED, reason);
}

export async function expireOldCases(): Promise<number> {
  const expired = await getExpiredCandidates();
  let count = 0;

  for (const recoveryCase of expired) {
    await cancelPendingMessages(recoveryCase.id);
    await transitionCaseStatus(
      recoveryCase.id,
      CaseStatus.EXPIRED,
      "ttl_exceeded"
    );
    count++;
  }

  return count;
}

export function getSmsCopy(
  caseType: CaseType,
  sequenceStep: number,
  recoveryUrl: string
): { body: string } {
  let text: string;

  if (caseType === CaseType.CONFIRMED_DECLINE) {
    switch (sequenceStep) {
      case 1:
        text = "Your payment didn't go through but your cart is saved! Complete your order:";
        break;
      case 2:
        text = "Still want your items? Try a different payment method:";
        break;
      default:
        text = "Last chance \u2014 your cart expires soon. Complete your order:";
        break;
    }
  } else {
    switch (sequenceStep) {
      case 1:
        text = "You left items in your cart! Complete your order:";
        break;
      case 2:
        text = "Your cart is still waiting. Finish your purchase:";
        break;
      default:
        text = "Final reminder \u2014 your cart expires soon:";
        break;
    }
  }

  return { body: `${text} ${recoveryUrl}` };
}

export function getEmailCopy(
  caseType: CaseType,
  sequenceStep: number
): { subject: string; body: string } {
  if (caseType === CaseType.CONFIRMED_DECLINE) {
    switch (sequenceStep) {
      case 1:
        return {
          subject: "Your payment didn't go through — your cart is still saved",
          body: "It looks like your payment didn't complete. Your items are still reserved — complete your order here.",
        };
      case 2:
        return {
          subject: "Still want your items? Try a different payment method",
          body: "Your cart is still waiting. If your card didn't work, you can try PayPal or Shop Pay for a faster checkout.",
        };
      default:
        return {
          subject: "Last chance — your cart is about to expire",
          body: "Your reserved items won't be held much longer. Complete your purchase now before they're gone.",
        };
    }
  }

  switch (sequenceStep) {
    case 1:
      return {
        subject: "Looks like you didn't finish checking out",
        body: "Your items are still available. Complete your order here.",
      };
    case 2:
      return {
        subject: "Your cart is still waiting for you",
        body: "If you had trouble checking out, try a different payment method like PayPal or Shop Pay.",
      };
    default:
      return {
        subject: "Last chance to complete your order",
        body: "Your reserved items won't be held much longer. Finish your purchase before they're gone.",
      };
  }
}
