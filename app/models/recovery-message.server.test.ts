import { describe, it, expect, vi, beforeEach } from "vitest";
import { Channel } from "@prisma/client";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    recoveryMessage: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

import {
  createRecoveryMessage,
  markMessageSent,
  markMessageClicked,
  markMessageOpened,
  getScheduledMessages,
  cancelPendingMessages,
  updateDeliveryStatus,
} from "~/models/recovery-message.server";

describe("createRecoveryMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates message with all params", async () => {
    const scheduled = new Date("2026-03-15T10:00:00Z");
    const created = { id: 1, recoveryCaseId: 10, sequenceStep: 1 };
    mockCreate.mockResolvedValue(created);

    const result = await createRecoveryMessage({
      recoveryCaseId: 10,
      channel: Channel.EMAIL,
      sequenceStep: 1,
      scheduledFor: scheduled,
      templateVersion: "v1.2",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        recoveryCaseId: 10,
        channel: "EMAIL",
        sequenceStep: 1,
        scheduledFor: scheduled,
        templateVersion: "v1.2",
      },
    });
    expect(result).toEqual(created);
  });

  it("handles optional channel and templateVersion as undefined", async () => {
    mockCreate.mockResolvedValue({ id: 2 });

    await createRecoveryMessage({
      recoveryCaseId: 20,
      sequenceStep: 2,
      scheduledFor: new Date(),
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: undefined,
        templateVersion: undefined,
      }),
    });
  });
});

describe("markMessageSent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates sentAt, deliveryStatus, and providerMessageId", async () => {
    const updated = { id: 1, deliveryStatus: "sent" };
    mockUpdate.mockResolvedValue(updated);

    const before = new Date();
    const result = await markMessageSent(1, "pm_abc123");
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        sentAt: expect.any(Date),
        deliveryStatus: "sent",
        providerMessageId: "pm_abc123",
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.sentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(updated);
  });
});

describe("markMessageClicked", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates clickedAt timestamp", async () => {
    const updated = { id: 5, clickedAt: new Date() };
    mockUpdate.mockResolvedValue(updated);

    const before = new Date();
    const result = await markMessageClicked(5);
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { clickedAt: expect.any(Date) },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.clickedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.clickedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(updated);
  });
});

describe("markMessageOpened", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates openedAt timestamp", async () => {
    const updated = { id: 6, openedAt: new Date() };
    mockUpdate.mockResolvedValue(updated);

    const before = new Date();
    const result = await markMessageOpened(6);
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { openedAt: expect.any(Date) },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.openedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.openedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(updated);
  });
});

describe("getScheduledMessages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("queries pending unsent messages scheduled before cutoff", async () => {
    const messages = [
      { id: 10, scheduledFor: new Date(), recoveryCase: {} },
    ];
    mockFindMany.mockResolvedValue(messages);
    const cutoff = new Date("2026-03-15T12:00:00Z");

    const result = await getScheduledMessages(cutoff);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        scheduledFor: { lte: cutoff },
        sentAt: null,
        deliveryStatus: "pending",
      },
      include: {
        recoveryCase: {
          include: { checkout: true, shop: true },
        },
      },
      orderBy: { scheduledFor: "asc" },
    });
    expect(result).toEqual(messages);
  });

  it("returns empty array when no messages scheduled", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getScheduledMessages(new Date());

    expect(result).toEqual([]);
  });
});

describe("cancelPendingMessages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates unsent pending messages to cancelled", async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    await cancelPendingMessages(42);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        recoveryCaseId: 42,
        sentAt: null,
        deliveryStatus: "pending",
      },
      data: { deliveryStatus: "cancelled" },
    });
  });

  it("handles case with no pending messages", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await cancelPendingMessages(999);

    expect(mockUpdateMany).toHaveBeenCalled();
  });
});

describe("updateDeliveryStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("finds message by providerMessageId and updates status", async () => {
    const message = { id: 15, providerMessageId: "pm_xyz" };
    mockFindFirst.mockResolvedValue(message);
    mockUpdate.mockResolvedValue({ ...message, deliveryStatus: "delivered" });

    await updateDeliveryStatus("pm_xyz", "delivered");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { providerMessageId: "pm_xyz" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 15 },
      data: { deliveryStatus: "delivered" },
    });
  });

  it("warns and returns early when message not found", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFindFirst.mockResolvedValue(null);

    await updateDeliveryStatus("pm_missing", "delivered");

    expect(warnSpy).toHaveBeenCalledWith(
      "No recovery message found for provider ID pm_missing"
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles various delivery status values", async () => {
    const message = { id: 16, providerMessageId: "pm_status" };
    mockFindFirst.mockResolvedValue(message);
    mockUpdate.mockResolvedValue({});

    for (const status of ["delivered", "bounced", "failed", "opened", "clicked"]) {
      vi.clearAllMocks();
      mockFindFirst.mockResolvedValue(message);
      mockUpdate.mockResolvedValue({});

      await updateDeliveryStatus("pm_status", status);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 16 },
        data: { deliveryStatus: status },
      });
    }
  });
});
