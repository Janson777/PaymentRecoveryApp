-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "planTier" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "billingSubscriptionId" TEXT,
ADD COLUMN     "billingActivatedAt" TIMESTAMP(3);
