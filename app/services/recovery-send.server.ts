import { CaseStatus, CaseType, Channel } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { sendRecoveryEmail } from "./email.server";
import { sendRecoverySMS } from "./sms.server";
import { getEmailCopy } from "./recovery-workflow.server";
import { markMessageSent } from "~/models/recovery-message.server";
import { isPhoneOptedOut } from "~/models/sms-opt-out.server";
import { parseShopSettings } from "~/lib/settings";
import type { RecoveryJobData } from "~/queues/recovery.server";

async function sendViaEmail(
  email: string,
  caseType: CaseType,
  sequenceStep: number,
  trackingUrl: string
): Promise<string> {
  const { subject, body } = getEmailCopy(caseType, sequenceStep);
  return sendRecoveryEmail({
    to: email,
    subject,
    body,
    recoveryUrl: trackingUrl,
    trackingUrl: undefined,
  });
}

export async function processRecoveryMessage(
  data: RecoveryJobData
): Promise<void> {
  const message = await prisma.recoveryMessage.findUnique({
    where: { id: data.recoveryMessageId },
    include: {
      recoveryCase: {
        include: { checkout: true, shop: true },
      },
    },
  });

  if (!message) {
    console.warn(`Recovery message ${data.recoveryMessageId} not found`);
    return;
  }

  if (message.sentAt) {
    console.warn(`Recovery message ${message.id} already sent`);
    return;
  }

  if (message.deliveryStatus === "cancelled") {
    return;
  }

  const recoveryCase = message.recoveryCase;
  const activeCaseStatuses: CaseStatus[] = [
    CaseStatus.READY,
    CaseStatus.MESSAGING,
  ];

  if (!activeCaseStatuses.includes(recoveryCase.caseStatus)) {
    console.log(`Case ${recoveryCase.id} is ${recoveryCase.caseStatus}, skipping message`);
    return;
  }

  const checkout = recoveryCase.checkout;
  if (!checkout?.recoveryUrl) {
    console.warn(`Case ${recoveryCase.id} missing recovery URL`);
    return;
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const trackingUrl = `${appUrl}/r/${recoveryCase.id}`;

  let providerMessageId: string;

  if (message.channel === Channel.SMS && checkout.phone) {
    const optedOut = await isPhoneOptedOut(checkout.phone);
    if (optedOut) {
      console.warn(
        `Case ${recoveryCase.id}: phone ${checkout.phone} opted out of SMS, falling back to email`
      );
      if (!checkout.email) {
        console.warn(`Case ${recoveryCase.id} missing email for opt-out fallback`);
        return;
      }
      providerMessageId = await sendViaEmail(
        checkout.email, recoveryCase.caseType, message.sequenceStep, trackingUrl
      );
    } else {
      const settings = parseShopSettings(recoveryCase.shop.settingsJson);
      const templateKey =
        recoveryCase.caseType === CaseType.CONFIRMED_DECLINE
          ? "confirmedDecline"
          : "likelyAbandonment";
      const smsBody = settings.smsTemplates[templateKey].body.replace(
        "{{recovery_url}}",
        trackingUrl
      );
      providerMessageId = await sendRecoverySMS({
        to: checkout.phone,
        body: smsBody,
      });
    }
  } else if (message.channel === Channel.SMS && !checkout.phone) {
    console.warn(
      `Case ${recoveryCase.id} missing phone number, falling back to email`
    );
    if (!checkout.email) {
      console.warn(`Case ${recoveryCase.id} missing both phone and email`);
      return;
    }
    providerMessageId = await sendViaEmail(
      checkout.email, recoveryCase.caseType, message.sequenceStep, trackingUrl
    );
  } else {
    if (!checkout.email) {
      console.warn(`Case ${recoveryCase.id} missing email address`);
      return;
    }
    providerMessageId = await sendViaEmail(
      checkout.email, recoveryCase.caseType, message.sequenceStep, trackingUrl
    );
  }

  await markMessageSent(message.id, providerMessageId);
}
