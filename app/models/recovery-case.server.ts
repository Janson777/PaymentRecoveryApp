import type { RecoveryCase } from "@prisma/client";
import { CaseStatus, CaseType } from "@prisma/client";
import { prisma } from "~/lib/db.server";

export async function createRecoveryCase(params: {
  shopId: number;
  checkoutId?: number;
  shopifyOrderGid?: string;
  caseType: CaseType;
  confidenceScore: number;
  suppressionMinutes: number;
}): Promise<RecoveryCase> {
  const now = new Date();
  const suppressionUntil = new Date(
    now.getTime() + params.suppressionMinutes * 60_000
  );

  return prisma.recoveryCase.create({
    data: {
      shopId: params.shopId,
      checkoutId: params.checkoutId,
      shopifyOrderGid: params.shopifyOrderGid,
      caseType: params.caseType,
      confidenceScore: params.confidenceScore,
      openedAt: now,
      suppressionUntil,
    },
  });
}

export async function transitionCaseStatus(
  caseId: number,
  newStatus: CaseStatus,
  closeReason?: string
): Promise<RecoveryCase> {
  const data: Record<string, unknown> = { caseStatus: newStatus };

  if (newStatus === CaseStatus.READY) {
    data.readyAt = new Date();
  }

  if (
    newStatus === CaseStatus.RECOVERED ||
    newStatus === CaseStatus.EXPIRED ||
    newStatus === CaseStatus.CANCELLED ||
    newStatus === CaseStatus.SUPPRESSED
  ) {
    data.closedAt = new Date();
    if (closeReason) {
      data.closeReason = closeReason;
    }
  }

  return prisma.recoveryCase.update({
    where: { id: caseId },
    data,
  });
}

export async function findOpenCaseForCheckout(
  shopId: number,
  checkoutId: number
): Promise<RecoveryCase | null> {
  return prisma.recoveryCase.findFirst({
    where: {
      shopId,
      checkoutId,
      caseStatus: { in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING] },
    },
  });
}

export async function findOpenCaseForOrder(
  shopId: number,
  shopifyOrderGid: string
): Promise<RecoveryCase | null> {
  return prisma.recoveryCase.findFirst({
    where: {
      shopId,
      shopifyOrderGid,
      caseStatus: { in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING] },
    },
  });
}

export async function getCasesReadyForMessaging(): Promise<RecoveryCase[]> {
  return prisma.recoveryCase.findMany({
    where: {
      caseStatus: CaseStatus.CANDIDATE,
      suppressionUntil: { lte: new Date() },
    },
    include: { checkout: true, shop: true },
  });
}

export async function getCasesByShop(
  shopId: number,
  statuses?: CaseStatus[]
): Promise<RecoveryCase[]> {
  return prisma.recoveryCase.findMany({
    where: {
      shopId,
      ...(statuses && statuses.length > 0
        ? { caseStatus: { in: statuses } }
        : {}),
    },
    include: {
      checkout: true,
      recoveryMessages: true,
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function getCaseById(
  caseId: number
): Promise<RecoveryCase | null> {
  return prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      checkout: true,
      recoveryMessages: { orderBy: { sequenceStep: "asc" } },
      shop: true,
    },
  });
}

export async function getExpiredCandidates(
  ttlHours: number = 72
): Promise<RecoveryCase[]> {
  const cutoff = new Date(Date.now() - ttlHours * 3_600_000);
  return prisma.recoveryCase.findMany({
    where: {
      caseStatus: { in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING] },
      openedAt: { lte: cutoff },
    },
  });
}
