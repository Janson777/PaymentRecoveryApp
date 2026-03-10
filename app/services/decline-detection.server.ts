import { CaseType, CaseStatus, SignalType } from "@prisma/client";
import {
  createRecoveryCase,
  findOpenCaseForCheckout,
  findOpenCaseForOrder,
} from "~/models/recovery-case.server";
import { prisma } from "~/lib/db.server";

const DEFAULT_SUPPRESSION_MINUTES = 15;
const ABANDONMENT_SUPPRESSION_MINUTES = 30;

export async function evaluateTransactionFailure(params: {
  shopId: number;
  shopifyOrderGid: string;
  errorCode?: string;
  gateway?: string;
}): Promise<void> {
  const existingCase = await findOpenCaseForOrder(
    params.shopId,
    params.shopifyOrderGid
  );

  if (existingCase) {
    return;
  }

  const hasSuccessSignal = await prisma.paymentSignal.findFirst({
    where: {
      shopId: params.shopId,
      shopifyOrderGid: params.shopifyOrderGid,
      signalType: SignalType.TRANSACTION_SUCCESS,
    },
  });

  if (hasSuccessSignal) {
    return;
  }

  const confidenceScore = calculateConfidenceScore({
    hasExplicitFailure: true,
    errorCode: params.errorCode,
  });

  await createRecoveryCase({
    shopId: params.shopId,
    shopifyOrderGid: params.shopifyOrderGid,
    caseType: CaseType.CONFIRMED_DECLINE,
    confidenceScore,
    suppressionMinutes: DEFAULT_SUPPRESSION_MINUTES,
  });
}

export async function evaluateAbandonedCheckout(params: {
  shopId: number;
  checkoutId: number;
  hasContactInfo: boolean;
  hasShippingInfo: boolean;
  totalAmount: number;
}): Promise<void> {
  if (!params.hasContactInfo || params.totalAmount <= 0) {
    return;
  }

  const existingCase = await findOpenCaseForCheckout(
    params.shopId,
    params.checkoutId
  );

  if (existingCase) {
    return;
  }

  const confidenceScore = calculateConfidenceScore({
    hasExplicitFailure: false,
    hasContactInfo: params.hasContactInfo,
    hasShippingInfo: params.hasShippingInfo,
    totalAmount: params.totalAmount,
  });

  await createRecoveryCase({
    shopId: params.shopId,
    checkoutId: params.checkoutId,
    caseType: CaseType.LIKELY_PAYMENT_STAGE_ABANDONMENT,
    confidenceScore,
    suppressionMinutes: ABANDONMENT_SUPPRESSION_MINUTES,
  });
}

function calculateConfidenceScore(params: {
  hasExplicitFailure: boolean;
  errorCode?: string;
  hasContactInfo?: boolean;
  hasShippingInfo?: boolean;
  totalAmount?: number;
}): number {
  let score = 0;

  if (params.hasExplicitFailure) {
    score += 70;
    if (params.errorCode) {
      score += 10;
    }
  } else {
    score += 30;
    if (params.hasContactInfo) score += 15;
    if (params.hasShippingInfo) score += 15;
    if (params.totalAmount && params.totalAmount > 0) score += 10;
  }

  return Math.min(score, 100);
}
