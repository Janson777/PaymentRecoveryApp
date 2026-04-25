import type { Shop } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export type PlanTier = "FREE" | "PRO";

export const FREE_CASES_LIMIT = 100;

export interface PlanLimits {
  maxCasesPerMonth: number | null;
  maxSequenceSteps: number;
  smsAllowed: boolean;
}

const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    maxCasesPerMonth: FREE_CASES_LIMIT,
    maxSequenceSteps: 2,
    smsAllowed: false,
  },
  PRO: {
    maxCasesPerMonth: null,
    maxSequenceSteps: 3,
    smsAllowed: true,
  },
};

export function getShopPlanTier(shop: Pick<Shop, "planTier">): PlanTier {
  const tier = shop.planTier as PlanTier;
  return tier === "PRO" ? "PRO" : "FREE";
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

export async function getMonthlyUsageCount(shopId: number): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.recoveryCase.count({
    where: {
      shopId,
      createdAt: { gte: startOfMonth },
    },
  });
}

export async function canCreateCase(
  shopId: number,
  tier: PlanTier
): Promise<boolean> {
  const limits = getPlanLimits(tier);
  if (limits.maxCasesPerMonth === null) return true;

  const usage = await getMonthlyUsageCount(shopId);
  return usage < limits.maxCasesPerMonth;
}

export function getMaxSequenceSteps(tier: PlanTier): number {
  return getPlanLimits(tier).maxSequenceSteps;
}

export function isChannelAllowed(
  tier: PlanTier,
  channel: "EMAIL" | "SMS" | "NONE"
): boolean {
  if (channel === "NONE" || channel === "EMAIL") return true;
  return getPlanLimits(tier).smsAllowed;
}
