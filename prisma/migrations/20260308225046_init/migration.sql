-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('QUEUED', 'PROCESSED', 'SKIPPED_DUPLICATE', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('ACTIVE', 'ABANDONED', 'RECOVERED', 'EXPIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('TRANSACTION_FAILURE', 'TRANSACTION_ERROR', 'TRANSACTION_SUCCESS', 'ORDER_CREATED', 'ORDER_PAID', 'ORDER_CANCELLED', 'LIKELY_LATE_STAGE_ABANDONMENT');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('CONFIRMED_DECLINE', 'LIKELY_PAYMENT_STAGE_ABANDONMENT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('CANDIDATE', 'SUPPRESSED', 'READY', 'MESSAGING', 'RECOVERED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "Shop" (
    "id" SERIAL NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL,
    "uninstalledAt" TIMESTAMP(3),
    "defaultTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "apiVersion" TEXT NOT NULL,
    "hmacValid" BOOLEAN NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "shopifyCheckoutId" TEXT,
    "checkoutToken" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "customerId" TEXT,
    "currency" TEXT,
    "subtotalAmount" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30),
    "lineItemsHash" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "recoveryUrl" TEXT,
    "recoveredAt" TIMESTAMP(3),
    "checkoutStatus" "CheckoutStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSignal" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "checkoutId" INTEGER,
    "shopifyOrderGid" TEXT,
    "shopifyTransactionGid" TEXT,
    "signalType" "SignalType" NOT NULL,
    "gateway" TEXT,
    "transactionKind" TEXT,
    "transactionStatus" TEXT,
    "errorCode" TEXT,
    "paymentMethodSummary" TEXT,
    "amount" DECIMAL(65,30),
    "currency" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawSourceTopic" TEXT,
    "rawSourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "checkoutId" INTEGER,
    "shopifyOrderGid" TEXT,
    "caseType" "CaseType" NOT NULL,
    "caseStatus" "CaseStatus" NOT NULL DEFAULT 'CANDIDATE',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "suppressionUntil" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "primaryReasonCode" TEXT,
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryMessage" (
    "id" SERIAL NOT NULL,
    "recoveryCaseId" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'EMAIL',
    "sequenceStep" INTEGER NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT '1',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "checkoutCompletedAfterClickAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdersIndex" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "shopifyOrderGid" TEXT NOT NULL,
    "orderName" TEXT,
    "email" TEXT,
    "customerId" TEXT,
    "financialStatus" TEXT,
    "gatewayNamesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "checkoutRecoveryAttributedCaseId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdersIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shopId_eventId_topic_key" ON "WebhookEvent"("shopId", "eventId", "topic");

-- CreateIndex
CREATE INDEX "Checkout_shopId_checkoutStatus_idx" ON "Checkout"("shopId", "checkoutStatus");

-- CreateIndex
CREATE INDEX "RecoveryCase_shopId_caseStatus_idx" ON "RecoveryCase"("shopId", "caseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OrdersIndex_shopifyOrderGid_key" ON "OrdersIndex"("shopifyOrderGid");

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSignal" ADD CONSTRAINT "PaymentSignal_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSignal" ADD CONSTRAINT "PaymentSignal_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryMessage" ADD CONSTRAINT "RecoveryMessage_recoveryCaseId_fkey" FOREIGN KEY ("recoveryCaseId") REFERENCES "RecoveryCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdersIndex" ADD CONSTRAINT "OrdersIndex_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
