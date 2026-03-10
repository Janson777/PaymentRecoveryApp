import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "./connection.server";

export interface ReconciliationJobData {
  shopId: number;
  jobType: "abandoned_checkout" | "orphan_reconciliation";
}

const QUEUE_NAME = "reconciliation";

export function getReconciliationQueue(): Queue<ReconciliationJobData> {
  return new Queue<ReconciliationJobData>(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 604_800 },
    },
  });
}

export function createReconciliationWorker(
  processor: (data: ReconciliationJobData) => Promise<void>
): Worker<ReconciliationJobData> {
  return new Worker<ReconciliationJobData>(
    QUEUE_NAME,
    async (job) => processor(job.data),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 2,
    }
  );
}
