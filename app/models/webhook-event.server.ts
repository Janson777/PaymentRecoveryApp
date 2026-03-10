import type { WebhookEvent } from "@prisma/client";
import { ProcessingStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export interface WebhookHeaders {
  topic: string;
  shopDomain: string;
  apiVersion: string;
  webhookId: string;
  eventId: string;
  triggeredAt: string;
  hmac: string;
}

export async function persistWebhookEvent(params: {
  shopId: number;
  headers: WebhookHeaders;
  payload: unknown;
  hmacValid: boolean;
}): Promise<{ event: WebhookEvent; isDuplicate: boolean }> {
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      shopId_eventId_topic: {
        shopId: params.shopId,
        eventId: params.headers.eventId,
        topic: params.headers.topic,
      },
    },
  });

  if (existing) {
    const updated = await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: { processingStatus: ProcessingStatus.SKIPPED_DUPLICATE },
    });
    return { event: updated, isDuplicate: true };
  }

  const event = await prisma.webhookEvent.create({
    data: {
      shopId: params.shopId,
      topic: params.headers.topic,
      eventId: params.headers.eventId,
      webhookId: params.headers.webhookId,
      triggeredAt: new Date(params.headers.triggeredAt),
      apiVersion: params.headers.apiVersion,
      hmacValid: params.hmacValid,
      payloadJson: params.payload as object,
    },
  });

  return { event, isDuplicate: false };
}

export async function markEventProcessed(
  eventId: number,
  status: ProcessingStatus
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      processingStatus: status,
      processedAt: new Date(),
    },
  });
}

export async function getUnprocessedEvents(
  shopId: number,
  limit: number = 50
): Promise<WebhookEvent[]> {
  return prisma.webhookEvent.findMany({
    where: {
      shopId,
      processingStatus: ProcessingStatus.QUEUED,
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });
}
