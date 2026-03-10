import { createWebhookWorker } from "./app/queues/webhook.server";
import { createRecoveryWorker } from "./app/queues/recovery.server";
import { createReconciliationWorker } from "./app/queues/reconciliation.server";
import { processWebhookEvent } from "./app/services/webhook-processor.server";
import { processRecoveryMessage } from "./app/services/recovery-send.server";
import { processReconciliation, scheduleReconciliationJobs } from "./app/services/reconciliation.server";
import { initSentry, captureException } from "./app/lib/sentry.server";

initSentry();

console.log("Starting worker process...");

const webhookWorker = createWebhookWorker(async (data) => {
  console.log(`Processing webhook event ${data.webhookEventId} (${data.topic})`);
  await processWebhookEvent(data);
});

const recoveryWorker = createRecoveryWorker(async (data) => {
  console.log(`Processing recovery message ${data.recoveryMessageId} for case ${data.recoveryCaseId}`);
  await processRecoveryMessage(data);
});

const reconciliationWorker = createReconciliationWorker(async (data) => {
  console.log(`Processing reconciliation job: ${data.jobType} (shop ${data.shopId})`);
  await processReconciliation(data);
});

for (const worker of [webhookWorker, recoveryWorker, reconciliationWorker]) {
  worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
    captureException(error);
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });
}

scheduleReconciliationJobs().catch((error) => {
  console.error("Failed to schedule reconciliation jobs:", error);
  captureException(error);
});

console.log("Worker process started. Listening for jobs...");

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down workers...");
  await Promise.all([
    webhookWorker.close(),
    recoveryWorker.close(),
    reconciliationWorker.close(),
  ]);
  process.exit(0);
});
