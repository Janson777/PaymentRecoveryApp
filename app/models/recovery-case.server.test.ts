import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaseStatus, CaseType } from "@prisma/client";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    recoveryCase: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

import {
  createRecoveryCase,
  transitionCaseStatus,
  findOpenCaseForCheckout,
  findOpenCaseForOrder,
  getCasesReadyForMessaging,
  getCasesByShop,
  getCaseById,
  getExpiredCandidates,
} from "~/models/recovery-case.server";

describe("createRecoveryCase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates case with suppression window calculated from minutes", async () => {
    const created = { id: 1, caseStatus: CaseStatus.CANDIDATE };
    mockCreate.mockResolvedValue(created);

    const before = new Date();
    const result = await createRecoveryCase({
      shopId: 10,
      checkoutId: 100,
      shopifyOrderGid: "gid://shopify/Order/500",
      caseType: CaseType.CONFIRMED_DECLINE,
      confidenceScore: 0.95,
      suppressionMinutes: 30,
    });
    const after = new Date();

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        shopId: 10,
        checkoutId: 100,
        shopifyOrderGid: "gid://shopify/Order/500",
        caseType: CaseType.CONFIRMED_DECLINE,
        confidenceScore: 0.95,
        openedAt: expect.any(Date),
        suppressionUntil: expect.any(Date),
      },
    });

    const call = mockCreate.mock.calls[0][0];
    const openedAt = call.data.openedAt as Date;
    const suppressionUntil = call.data.suppressionUntil as Date;
    const diffMs = suppressionUntil.getTime() - openedAt.getTime();
    expect(diffMs).toBe(30 * 60_000);
    expect(openedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(openedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(created);
  });

  it("handles zero suppression minutes", async () => {
    mockCreate.mockResolvedValue({ id: 2 });

    await createRecoveryCase({
      shopId: 10,
      caseType: CaseType.LIKELY_ABANDONMENT,
      confidenceScore: 0.6,
      suppressionMinutes: 0,
    });

    const call = mockCreate.mock.calls[0][0];
    const openedAt = call.data.openedAt as Date;
    const suppressionUntil = call.data.suppressionUntil as Date;
    expect(suppressionUntil.getTime()).toBe(openedAt.getTime());
  });

  it("passes optional checkoutId and shopifyOrderGid", async () => {
    mockCreate.mockResolvedValue({ id: 3 });

    await createRecoveryCase({
      shopId: 10,
      caseType: CaseType.CONFIRMED_DECLINE,
      confidenceScore: 0.8,
      suppressionMinutes: 15,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkoutId: undefined,
        shopifyOrderGid: undefined,
      }),
    });
  });
});

describe("transitionCaseStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets readyAt when transitioning to READY", async () => {
    mockUpdate.mockResolvedValue({ id: 1, caseStatus: CaseStatus.READY });

    const before = new Date();
    await transitionCaseStatus(1, CaseStatus.READY);
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        caseStatus: CaseStatus.READY,
        readyAt: expect.any(Date),
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.readyAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.readyAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("sets closedAt when transitioning to RECOVERED", async () => {
    mockUpdate.mockResolvedValue({ id: 2, caseStatus: CaseStatus.RECOVERED });

    await transitionCaseStatus(2, CaseStatus.RECOVERED, "order_paid");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        caseStatus: CaseStatus.RECOVERED,
        closedAt: expect.any(Date),
        closeReason: "order_paid",
      },
    });
  });

  it("sets closedAt when transitioning to EXPIRED", async () => {
    mockUpdate.mockResolvedValue({ id: 3, caseStatus: CaseStatus.EXPIRED });

    await transitionCaseStatus(3, CaseStatus.EXPIRED, "ttl_exceeded");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        caseStatus: CaseStatus.EXPIRED,
        closedAt: expect.any(Date),
        closeReason: "ttl_exceeded",
      },
    });
  });

  it("sets closedAt when transitioning to CANCELLED", async () => {
    mockUpdate.mockResolvedValue({ id: 4, caseStatus: CaseStatus.CANCELLED });

    await transitionCaseStatus(4, CaseStatus.CANCELLED, "merchant_closed");

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 4 },
      data: {
        caseStatus: CaseStatus.CANCELLED,
        closedAt: expect.any(Date),
        closeReason: "merchant_closed",
      },
    });
  });

  it("sets closedAt when transitioning to SUPPRESSED", async () => {
    mockUpdate.mockResolvedValue({ id: 5, caseStatus: CaseStatus.SUPPRESSED });

    await transitionCaseStatus(5, CaseStatus.SUPPRESSED);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        caseStatus: CaseStatus.SUPPRESSED,
        closedAt: expect.any(Date),
      },
    });
  });

  it("omits closeReason when not provided for closed status", async () => {
    mockUpdate.mockResolvedValue({ id: 6 });

    await transitionCaseStatus(6, CaseStatus.RECOVERED);

    const call = mockUpdate.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("closeReason");
  });

  it("does not set readyAt or closedAt for MESSAGING transition", async () => {
    mockUpdate.mockResolvedValue({ id: 7, caseStatus: CaseStatus.MESSAGING });

    await transitionCaseStatus(7, CaseStatus.MESSAGING);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { caseStatus: CaseStatus.MESSAGING },
    });
  });

  it("does not set readyAt or closedAt for CANDIDATE transition", async () => {
    mockUpdate.mockResolvedValue({ id: 8, caseStatus: CaseStatus.CANDIDATE });

    await transitionCaseStatus(8, CaseStatus.CANDIDATE);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { caseStatus: CaseStatus.CANDIDATE },
    });
  });
});

describe("findOpenCaseForCheckout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("queries for open statuses (CANDIDATE, READY, MESSAGING)", async () => {
    const openCase = { id: 10, caseStatus: CaseStatus.CANDIDATE };
    mockFindFirst.mockResolvedValue(openCase);

    const result = await findOpenCaseForCheckout(1, 100);

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        shopId: 1,
        checkoutId: 100,
        caseStatus: {
          in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING],
        },
      },
    });
    expect(result).toEqual(openCase);
  });

  it("returns null when no open case exists", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findOpenCaseForCheckout(1, 999);

    expect(result).toBeNull();
  });
});

describe("findOpenCaseForOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("queries for open statuses by shopifyOrderGid", async () => {
    const openCase = { id: 20, caseStatus: CaseStatus.MESSAGING };
    mockFindFirst.mockResolvedValue(openCase);

    const result = await findOpenCaseForOrder(1, "gid://shopify/Order/500");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        shopId: 1,
        shopifyOrderGid: "gid://shopify/Order/500",
        caseStatus: {
          in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING],
        },
      },
    });
    expect(result).toEqual(openCase);
  });

  it("returns null when no open case exists", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findOpenCaseForOrder(1, "gid://shopify/Order/missing");

    expect(result).toBeNull();
  });
});

describe("getCasesReadyForMessaging", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns CANDIDATE cases past suppression window with includes", async () => {
    const cases = [
      { id: 30, caseStatus: CaseStatus.CANDIDATE, checkout: {}, shop: {} },
    ];
    mockFindMany.mockResolvedValue(cases);

    const before = new Date();
    const result = await getCasesReadyForMessaging();
    const after = new Date();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        caseStatus: CaseStatus.CANDIDATE,
        suppressionUntil: { lte: expect.any(Date) },
      },
      include: { checkout: true, shop: true },
    });
    const call = mockFindMany.mock.calls[0][0];
    const lteDate = call.where.suppressionUntil.lte;
    expect(lteDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lteDate.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(cases);
  });

  it("returns empty array when no cases ready", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getCasesReadyForMessaging();

    expect(result).toEqual([]);
  });
});

describe("getCasesByShop", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("filters by statuses when provided", async () => {
    const cases = [{ id: 40 }];
    mockFindMany.mockResolvedValue(cases);

    const result = await getCasesByShop(1, [
      CaseStatus.READY,
      CaseStatus.MESSAGING,
    ]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        shopId: 1,
        caseStatus: { in: [CaseStatus.READY, CaseStatus.MESSAGING] },
      },
      include: {
        checkout: true,
        recoveryMessages: true,
      },
      orderBy: { openedAt: "desc" },
    });
    expect(result).toEqual(cases);
  });

  it("omits status filter when statuses is undefined", async () => {
    mockFindMany.mockResolvedValue([]);

    await getCasesByShop(2);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { shopId: 2 },
      include: {
        checkout: true,
        recoveryMessages: true,
      },
      orderBy: { openedAt: "desc" },
    });
  });

  it("omits status filter when statuses is empty array", async () => {
    mockFindMany.mockResolvedValue([]);

    await getCasesByShop(3, []);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { shopId: 3 },
      include: {
        checkout: true,
        recoveryMessages: true,
      },
      orderBy: { openedAt: "desc" },
    });
  });
});

describe("getCaseById", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns case with includes (checkout, messages sorted by step, shop)", async () => {
    const caseData = {
      id: 50,
      checkout: {},
      recoveryMessages: [],
      shop: {},
    };
    mockFindUnique.mockResolvedValue(caseData);

    const result = await getCaseById(50);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 50 },
      include: {
        checkout: true,
        recoveryMessages: { orderBy: { sequenceStep: "asc" } },
        shop: true,
      },
    });
    expect(result).toEqual(caseData);
  });

  it("returns null when case not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getCaseById(999);

    expect(result).toBeNull();
  });
});

describe("getExpiredCandidates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses default 72-hour TTL", async () => {
    const expired = [{ id: 60 }, { id: 61 }];
    mockFindMany.mockResolvedValue(expired);

    const before = new Date();
    const result = await getExpiredCandidates();
    const after = new Date();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        caseStatus: {
          in: [CaseStatus.CANDIDATE, CaseStatus.READY, CaseStatus.MESSAGING],
        },
        openedAt: { lte: expect.any(Date) },
      },
    });
    const call = mockFindMany.mock.calls[0][0];
    const cutoff = call.where.openedAt.lte;
    const expectedMs = 72 * 3_600_000;
    expect(before.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(after.getTime() - cutoff.getTime()).toBeLessThanOrEqual(expectedMs + 100);
    expect(result).toEqual(expired);
  });

  it("respects custom TTL hours", async () => {
    mockFindMany.mockResolvedValue([]);

    const before = new Date();
    await getExpiredCandidates(24);
    const after = new Date();

    const call = mockFindMany.mock.calls[0][0];
    const cutoff = call.where.openedAt.lte;
    const expectedMs = 24 * 3_600_000;
    expect(before.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(expectedMs - 100);
    expect(after.getTime() - cutoff.getTime()).toBeLessThanOrEqual(expectedMs + 100);
  });

  it("returns empty array when no expired cases", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getExpiredCandidates();

    expect(result).toEqual([]);
  });
});
