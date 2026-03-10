import { Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "./connection.server";

export interface RecoveryJobData {
  recoveryMessageId: number;
  recoveryCaseId: number;
}

const QUEUE_NAME = "recovery-messaging";

export function getRecoveryQueue(): Queue<RecoveryJobData> {
  return new Queue<RecoveryJobData>(QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 604_800 },
    },
  });
}

export function createRecoveryWorker(
  processor: (data: RecoveryJobData) => Promise<void>
): Worker<RecoveryJobData> {
  return new Worker<RecoveryJobData>(
    QUEUE_NAME,
    async (job) => processor(job.data),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    }
  );
}
