import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProcessingStatus } from "@prisma/client";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    webhookEvent: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  persistWebhookEvent,
  markEventProcessed,
  getUnprocessedEvents,
} from "~/models/webhook-event.server";

describe("persistWebhookEvent", () => {
  const headers = {
    topic: "checkouts/create",
    shopDomain: "test.myshopify.com",
    apiVersion: "2026-01",
    webhookId: "wh_001",
    eventId: "evt_001",
    triggeredAt: "2026-03-10T12:00:00Z",
    hmac: "abc123",
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates new event when no duplicate exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const created = { id: 1, topic: "checkouts/create" };
    mockCreate.mockResolvedValue(created);

    const result = await persistWebhookEvent({
      shopId: 10,
      headers,
      payload: { id: "chk_1", email: "test@example.com" },
      hmacValid: true,
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        shopId_eventId_topic: {
          shopId: 10,
          eventId: "evt_001",
          topic: "checkouts/create",
        },
      },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        shopId: 10,
        topic: "checkouts/create",
        eventId: "evt_001",
        webhookId: "wh_001",
        triggeredAt: new Date("2026-03-10T12:00:00Z"),
        apiVersion: "2026-01",
        hmacValid: true,
        payloadJson: { id: "chk_1", email: "test@example.com" },
      },
    });
    expect(result).toEqual({ event: created, isDuplicate: false });
  });

  it("marks duplicate and returns existing event when found", async () => {
    const existing = { id: 5, topic: "checkouts/create" };
    mockFindUnique.mockResolvedValue(existing);
    const updated = {
      ...existing,
      processingStatus: ProcessingStatus.SKIPPED_DUPLICATE,
    };
    mockUpdate.mockResolvedValue(updated);

    const result = await persistWebhookEvent({
      shopId: 10,
      headers,
      payload: { id: "chk_1" },
      hmacValid: true,
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { processingStatus: ProcessingStatus.SKIPPED_DUPLICATE },
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ event: updated, isDuplicate: true });
  });

  it("stores hmacValid as false when invalid", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 6 });

    await persistWebhookEvent({
      shopId: 10,
      headers,
      payload: {},
      hmacValid: false,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hmacValid: false,
      }),
    });
  });

  it("correctly parses triggeredAt from header string", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 7 });

    const customHeaders = {
      ...headers,
      triggeredAt: "2026-06-15T08:30:00Z",
    };

    await persistWebhookEvent({
      shopId: 10,
      headers: customHeaders,
      payload: {},
      hmacValid: true,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggeredAt: new Date("2026-06-15T08:30:00Z"),
      }),
    });
  });

  it("uses correct composite unique key for dedup lookup", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 8 });

    const customHeaders = {
      ...headers,
      eventId: "evt_custom",
      topic: "orders/paid",
    };

    await persistWebhookEvent({
      shopId: 25,
      headers: customHeaders,
      payload: {},
      hmacValid: true,
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        shopId_eventId_topic: {
          shopId: 25,
          eventId: "evt_custom",
          topic: "orders/paid",
        },
      },
    });
  });
});

describe("markEventProcessed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates processing status and processedAt timestamp", async () => {
    mockUpdate.mockResolvedValue({});

    const before = new Date();
    await markEventProcessed(100, ProcessingStatus.PROCESSED);
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        processingStatus: ProcessingStatus.PROCESSED,
        processedAt: expect.any(Date),
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.processedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.processedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("handles FAILED status", async () => {
    mockUpdate.mockResolvedValue({});

    await markEventProcessed(200, ProcessingStatus.FAILED);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 200 },
      data: {
        processingStatus: ProcessingStatus.FAILED,
        processedAt: expect.any(Date),
      },
    });
  });
});

describe("getUnprocessedEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns QUEUED events ordered by receivedAt with default limit", async () => {
    const events = [{ id: 1 }, { id: 2 }];
    mockFindMany.mockResolvedValue(events);

    const result = await getUnprocessedEvents(10);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        shopId: 10,
        processingStatus: ProcessingStatus.QUEUED,
      },
      orderBy: { receivedAt: "asc" },
      take: 50,
    });
    expect(result).toEqual(events);
  });

  it("respects custom limit parameter", async () => {
    mockFindMany.mockResolvedValue([]);

    await getUnprocessedEvents(10, 10);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("returns empty array when no unprocessed events", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getUnprocessedEvents(99);

    expect(result).toEqual([]);
  });
});
