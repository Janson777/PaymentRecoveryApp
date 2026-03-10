import type { RecoveryMessage } from "@prisma/client";
import type { Channel } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export async function createRecoveryMessage(params: {
  recoveryCaseId: number;
  channel?: Channel;
  sequenceStep: number;
  scheduledFor: Date;
  templateVersion?: string;
}): Promise<RecoveryMessage> {
  return prisma.recoveryMessage.create({
    data: {
      recoveryCaseId: params.recoveryCaseId,
      channel: params.channel,
      sequenceStep: params.sequenceStep,
      scheduledFor: params.scheduledFor,
      templateVersion: params.templateVersion,
    },
  });
}

export async function markMessageSent(
  messageId: number,
  providerMessageId: string
): Promise<RecoveryMessage> {
  return prisma.recoveryMessage.update({
    where: { id: messageId },
    data: {
      sentAt: new Date(),
      deliveryStatus: "sent",
      providerMessageId,
    },
  });
}

export async function markMessageClicked(
  messageId: number
): Promise<RecoveryMessage> {
  return prisma.recoveryMessage.update({
    where: { id: messageId },
    data: { clickedAt: new Date() },
  });
}

export async function markMessageOpened(
  messageId: number
): Promise<RecoveryMessage> {
  return prisma.recoveryMessage.update({
    where: { id: messageId },
    data: { openedAt: new Date() },
  });
}

export async function getScheduledMessages(
  beforeDate: Date
): Promise<RecoveryMessage[]> {
  return prisma.recoveryMessage.findMany({
    where: {
      scheduledFor: { lte: beforeDate },
      sentAt: null,
      deliveryStatus: "pending",
    },
    include: {
      recoveryCase: {
        include: { checkout: true, shop: true },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function cancelPendingMessages(
  recoveryCaseId: number
): Promise<void> {
  await prisma.recoveryMessage.updateMany({
    where: {
      recoveryCaseId,
      sentAt: null,
      deliveryStatus: "pending",
    },
    data: { deliveryStatus: "cancelled" },
  });
}

export async function updateDeliveryStatus(
  providerMessageId: string,
  status: string
): Promise<void> {
  const message = await prisma.recoveryMessage.findFirst({
    where: { providerMessageId },
  });

  if (!message) {
    console.warn(
      `No recovery message found for provider ID ${providerMessageId}`
    );
    return;
  }

  await prisma.recoveryMessage.update({
    where: { id: message.id },
    data: { deliveryStatus: status },
  });
}
