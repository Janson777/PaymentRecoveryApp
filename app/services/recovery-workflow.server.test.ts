import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaseStatus, CaseType, Channel } from "@prisma/client";

const mockTransitionCaseStatus = vi.fn();
const mockGetCasesReadyForMessaging = vi.fn();
const mockGetExpiredCandidates = vi.fn();
const mockCreateRecoveryMessage = vi.fn();
const mockCancelPendingMessages = vi.fn();
const mockGetRecoveryQueue = vi.fn();
const mockFindShopById = vi.fn();
const mockParseShopSettings = vi.fn();
const mockGetChannelForStep = vi.fn();
const mockQueueAdd = vi.fn();

vi.mock("~/models/recovery-case.server", () => ({
  transitionCaseStatus: (...args: unknown[]) =>
    mockTransitionCaseStatus(...args),
  getCasesReadyForMessaging: (...args: unknown[]) =>
    mockGetCasesReadyForMessaging(...args),
  getExpiredCandidates: (...args: unknown[]) =>
    mockGetExpiredCandidates(...args),
}));

vi.mock("~/models/recovery-message.server", () => ({
  createRecoveryMessage: (...args: unknown[]) =>
    mockCreateRecoveryMessage(...args),
  cancelPendingMessages: (...args: unknown[]) =>
    mockCancelPendingMessages(...args),
}));

vi.mock("~/queues/recovery.server", () => ({
  getRecoveryQueue: (...args: unknown[]) => mockGetRecoveryQueue(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
}));

vi.mock("~/lib/settings", () => ({
  parseShopSettings: (...args: unknown[]) => mockParseShopSettings(...args),
  getChannelForStep: (...args: unknown[]) => mockGetChannelForStep(...args),
}));

import {
  promoteReadyCases,
  suppressCase,
  recoverCase,
  cancelCase,
  expireOldCases,
  getSmsCopy,
  getEmailCopy,
} from "./recovery-workflow.server";

describe("recovery-workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransitionCaseStatus.mockResolvedValue(undefined);
    mockCancelPendingMessages.mockResolvedValue(undefined);
    mockQueueAdd.mockResolvedValue(undefined);
    mockGetRecoveryQueue.mockReturnValue({ add: mockQueueAdd });
    mockGetChannelForStep.mockReturnValue("EMAIL");
    mockParseShopSettings.mockReturnValue({
      retryDelays: [15, 720, 2160],
    });
  });

  describe("getSmsCopy", () => {
    const url = "https://app.example.com/r/42";

    describe("CONFIRMED_DECLINE", () => {
      it("returns step 1 copy", () => {
        const result = getSmsCopy(CaseType.CONFIRMED_DECLINE, 1, url);
        expect(result.body).toContain("payment didn't go through");
        expect(result.body).toContain("cart is saved");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns step 2 copy", () => {
        const result = getSmsCopy(CaseType.CONFIRMED_DECLINE, 2, url);
        expect(result.body).toContain("Still want your items");
        expect(result.body).toContain("different payment method");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns default copy for step 3+", () => {
        const result = getSmsCopy(CaseType.CONFIRMED_DECLINE, 3, url);
        expect(result.body).toContain("Last chance");
        expect(result.body).toContain("expires soon");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns default copy for step 4+", () => {
        const result = getSmsCopy(CaseType.CONFIRMED_DECLINE, 4, url);
        expect(result.body).toContain("Last chance");
        expect(result.body.endsWith(url)).toBe(true);
      });
    });

    describe("LIKELY_ABANDONMENT", () => {
      it("returns step 1 copy", () => {
        const result = getSmsCopy(CaseType.LIKELY_ABANDONMENT, 1, url);
        expect(result.body).toContain("left items in your cart");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns step 2 copy", () => {
        const result = getSmsCopy(CaseType.LIKELY_ABANDONMENT, 2, url);
        expect(result.body).toContain("cart is still waiting");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns default copy for step 3+", () => {
        const result = getSmsCopy(CaseType.LIKELY_ABANDONMENT, 3, url);
        expect(result.body).toContain("Final reminder");
        expect(result.body).toContain("expires soon");
        expect(result.body.endsWith(url)).toBe(true);
      });

      it("returns default copy for step 5", () => {
        const result = getSmsCopy(CaseType.LIKELY_ABANDONMENT, 5, url);
        expect(result.body).toContain("Final reminder");
        expect(result.body.endsWith(url)).toBe(true);
      });
    });

    it("appends recovery URL to body with a space", () => {
      const result = getSmsCopy(
        CaseType.CONFIRMED_DECLINE,
        1,
        "https://example.com/r/99"
      );
      expect(result.body).toMatch(/\s+https:\/\/example\.com\/r\/99$/);
    });
  });

  describe("getEmailCopy", () => {
    describe("CONFIRMED_DECLINE", () => {
      it("returns step 1 copy with subject and body", () => {
        const result = getEmailCopy(CaseType.CONFIRMED_DECLINE, 1);
        expect(result.subject).toContain("payment didn't go through");
        expect(result.subject).toContain("cart is still saved");
        expect(result.body).toContain("payment didn't complete");
        expect(result.body).toContain("items are still reserved");
      });

      it("returns step 2 copy", () => {
        const result = getEmailCopy(CaseType.CONFIRMED_DECLINE, 2);
        expect(result.subject).toContain("Still want your items");
        expect(result.subject).toContain("different payment method");
        expect(result.body).toContain("cart is still waiting");
        expect(result.body).toContain("PayPal or Shop Pay");
      });

      it("returns default copy for step 3+", () => {
        const result = getEmailCopy(CaseType.CONFIRMED_DECLINE, 3);
        expect(result.subject).toContain("Last chance");
        expect(result.subject).toContain("about to expire");
        expect(result.body).toContain("won't be held much longer");
      });

      it("returns default copy for step 10", () => {
        const result = getEmailCopy(CaseType.CONFIRMED_DECLINE, 10);
        expect(result.subject).toContain("Last chance");
        expect(result.body).toContain("Complete your purchase now");
      });
    });

    describe("LIKELY_ABANDONMENT", () => {
      it("returns step 1 copy", () => {
        const result = getEmailCopy(CaseType.LIKELY_ABANDONMENT, 1);
        expect(result.subject).toContain("didn't finish checking out");
        expect(result.body).toContain("items are still available");
      });

      it("returns step 2 copy", () => {
        const result = getEmailCopy(CaseType.LIKELY_ABANDONMENT, 2);
        expect(result.subject).toContain("cart is still waiting");
        expect(result.body).toContain("trouble checking out");
        expect(result.body).toContain("PayPal or Shop Pay");
      });

      it("returns default copy for step 3+", () => {
        const result = getEmailCopy(CaseType.LIKELY_ABANDONMENT, 3);
        expect(result.subject).toContain("Last chance");
        expect(result.subject).toContain("complete your order");
        expect(result.body).toContain("won't be held much longer");
      });

      it("returns default copy for step 7", () => {
        const result = getEmailCopy(CaseType.LIKELY_ABANDONMENT, 7);
        expect(result.subject).toContain("Last chance");
        expect(result.body).toContain("Finish your purchase");
      });
    });

    it("returns an object with subject and body keys", () => {
      const result = getEmailCopy(CaseType.CONFIRMED_DECLINE, 1);
      expect(result).toHaveProperty("subject");
      expect(result).toHaveProperty("body");
      expect(typeof result.subject).toBe("string");
      expect(typeof result.body).toBe("string");
    });
  });

  describe("promoteReadyCases", () => {
    it("promotes all ready cases and returns count", async () => {
      const cases = [
        { id: 1, shopId: 10 },
        { id: 2, shopId: 10 },
        { id: 3, shopId: 20 },
      ];
      mockGetCasesReadyForMessaging.mockResolvedValue(cases);
      mockFindShopById.mockResolvedValue({ id: 10, settingsJson: {} });
      mockCreateRecoveryMessage.mockResolvedValue({ id: 100 });

      const count = await promoteReadyCases();

      expect(count).toBe(3);
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        1,
        CaseStatus.READY
      );
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        2,
        CaseStatus.READY
      );
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        3,
        CaseStatus.READY
      );
    });

    it("returns 0 when no cases are ready", async () => {
      mockGetCasesReadyForMessaging.mockResolvedValue([]);

      const count = await promoteReadyCases();

      expect(count).toBe(0);
      expect(mockTransitionCaseStatus).not.toHaveBeenCalled();
    });

    it("schedules recovery sequence for each promoted case", async () => {
      mockGetCasesReadyForMessaging.mockResolvedValue([
        { id: 1, shopId: 10 },
      ]);
      mockFindShopById.mockResolvedValue({ id: 10, settingsJson: {} });
      mockCreateRecoveryMessage.mockResolvedValue({ id: 100 });

      await promoteReadyCases();

      expect(mockFindShopById).toHaveBeenCalledWith(10);
      expect(mockParseShopSettings).toHaveBeenCalled();
      expect(mockCreateRecoveryMessage).toHaveBeenCalledTimes(3);
      expect(mockQueueAdd).toHaveBeenCalledTimes(3);
    });
  });

  describe("scheduleRecoverySequence (via promoteReadyCases)", () => {
    beforeEach(() => {
      mockGetCasesReadyForMessaging.mockResolvedValue([
        { id: 5, shopId: 10 },
      ]);
      mockFindShopById.mockResolvedValue({ id: 10, settingsJson: {} });
      mockCreateRecoveryMessage.mockResolvedValue({ id: 200 });
    });

    it("uses shop settings retryDelays converted to ms", async () => {
      mockParseShopSettings.mockReturnValue({
        retryDelays: [10, 60], // 10 min, 60 min
      });

      await promoteReadyCases();

      expect(mockCreateRecoveryMessage).toHaveBeenCalledTimes(2);
      expect(mockQueueAdd).toHaveBeenCalledTimes(2);

      const firstJobOpts = mockQueueAdd.mock.calls[0][2];
      expect(firstJobOpts.delay).toBe(10 * 60_000);

      const secondJobOpts = mockQueueAdd.mock.calls[1][2];
      expect(secondJobOpts.delay).toBe(60 * 60_000);
    });

    it("falls back to DEFAULT_DELAYS_MS when retryDelays is empty", async () => {
      mockParseShopSettings.mockReturnValue({ retryDelays: [] });

      await promoteReadyCases();

      expect(mockCreateRecoveryMessage).toHaveBeenCalledTimes(3);

      const delays = mockQueueAdd.mock.calls.map(
        (call: unknown[]) => (call[2] as { delay: number }).delay
      );
      expect(delays).toEqual([
        15 * 60_000,
        12 * 3_600_000,
        36 * 3_600_000,
      ]);
    });

    it("uses getChannelForStep to determine channel per step", async () => {
      mockGetChannelForStep
        .mockReturnValueOnce("SMS")
        .mockReturnValueOnce("EMAIL")
        .mockReturnValueOnce("SMS");

      await promoteReadyCases();

      const channels = mockCreateRecoveryMessage.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { channel: Channel }).channel
      );
      expect(channels).toEqual([Channel.SMS, Channel.EMAIL, Channel.SMS]);
    });

    it("creates messages with correct sequenceStep (1-indexed)", async () => {
      await promoteReadyCases();

      const steps = mockCreateRecoveryMessage.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { sequenceStep: number }).sequenceStep
      );
      expect(steps).toEqual([1, 2, 3]);
    });

    it("creates messages with correct recoveryCaseId", async () => {
      await promoteReadyCases();

      const caseIds = mockCreateRecoveryMessage.mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { recoveryCaseId: number }).recoveryCaseId
      );
      expect(caseIds).toEqual([5, 5, 5]);
    });

    it("adds jobs to queue with correct name and data", async () => {
      mockCreateRecoveryMessage.mockResolvedValue({ id: 300 });

      await promoteReadyCases();

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-5-step-1",
        { recoveryMessageId: 300, recoveryCaseId: 5 },
        expect.objectContaining({ delay: expect.any(Number) })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-5-step-2",
        { recoveryMessageId: 300, recoveryCaseId: 5 },
        expect.objectContaining({ delay: expect.any(Number) })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "recovery-5-step-3",
        { recoveryMessageId: 300, recoveryCaseId: 5 },
        expect.objectContaining({ delay: expect.any(Number) })
      );
    });

    it("transitions case to MESSAGING after scheduling", async () => {
      await promoteReadyCases();

      const transitionCalls = mockTransitionCaseStatus.mock.calls;
      const lastCall = transitionCalls[transitionCalls.length - 1];
      expect(lastCall).toEqual([5, CaseStatus.MESSAGING]);
    });

    it("handles null shop gracefully", async () => {
      mockFindShopById.mockResolvedValue(null);

      await promoteReadyCases();

      expect(mockParseShopSettings).toHaveBeenCalledWith(undefined);
      expect(mockCreateRecoveryMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe("suppressCase", () => {
    it("cancels pending messages and transitions to SUPPRESSED", async () => {
      await suppressCase(42, "order_paid_externally");

      expect(mockCancelPendingMessages).toHaveBeenCalledWith(42);
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        42,
        CaseStatus.SUPPRESSED,
        "order_paid_externally"
      );
    });

    it("calls cancelPendingMessages before transitionCaseStatus", async () => {
      const callOrder: string[] = [];
      mockCancelPendingMessages.mockImplementation(() => {
        callOrder.push("cancel");
        return Promise.resolve();
      });
      mockTransitionCaseStatus.mockImplementation(() => {
        callOrder.push("transition");
        return Promise.resolve();
      });

      await suppressCase(1, "test");

      expect(callOrder).toEqual(["cancel", "transition"]);
    });
  });

  describe("recoverCase", () => {
    it("cancels pending messages and transitions to RECOVERED", async () => {
      await recoverCase(55);

      expect(mockCancelPendingMessages).toHaveBeenCalledWith(55);
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        55,
        CaseStatus.RECOVERED,
        "order_paid"
      );
    });
  });

  describe("cancelCase", () => {
    it("cancels pending messages and transitions to CANCELLED", async () => {
      await cancelCase(77, "merchant_closed");

      expect(mockCancelPendingMessages).toHaveBeenCalledWith(77);
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        77,
        CaseStatus.CANCELLED,
        "merchant_closed"
      );
    });
  });

  describe("expireOldCases", () => {
    it("expires all old cases and returns count", async () => {
      mockGetExpiredCandidates.mockResolvedValue([
        { id: 10 },
        { id: 20 },
        { id: 30 },
      ]);

      const count = await expireOldCases();

      expect(count).toBe(3);
      expect(mockCancelPendingMessages).toHaveBeenCalledWith(10);
      expect(mockCancelPendingMessages).toHaveBeenCalledWith(20);
      expect(mockCancelPendingMessages).toHaveBeenCalledWith(30);
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        10,
        CaseStatus.EXPIRED,
        "ttl_exceeded"
      );
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        20,
        CaseStatus.EXPIRED,
        "ttl_exceeded"
      );
      expect(mockTransitionCaseStatus).toHaveBeenCalledWith(
        30,
        CaseStatus.EXPIRED,
        "ttl_exceeded"
      );
    });

    it("returns 0 when no cases are expired", async () => {
      mockGetExpiredCandidates.mockResolvedValue([]);

      const count = await expireOldCases();

      expect(count).toBe(0);
      expect(mockCancelPendingMessages).not.toHaveBeenCalled();
      expect(mockTransitionCaseStatus).not.toHaveBeenCalled();
    });
  });
});
