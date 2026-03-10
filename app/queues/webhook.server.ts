import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "./connection.server";

export interface WebhookJobData {
  webhookEventId: number;
  shopId: number;
  topic: string;
}

const QUEUE_NAME = "webhook-processing";

export function getWebhookQueue(): Queue<WebhookJobData> {
  return new Queue<WebhookJobData>(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 604_800 },
    },
  });
}

export function createWebhookWorker(
  processor: (data: WebhookJobData) => Promise<void>
): Worker<WebhookJobData> {
  return new Worker<WebhookJobData>(
    QUEUE_NAME,
    async (job) => processor(job.data),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );
}
