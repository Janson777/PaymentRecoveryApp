import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    smsOptOut: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

import {
  recordOptOut,
  removeOptOut,
  isPhoneOptedOut,
} from "~/models/sms-opt-out.server";

describe("recordOptOut", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts with normalized phone number", async () => {
    mockUpsert.mockResolvedValue({});

    await recordOptOut("+15551234567");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "+15551234567" },
        create: expect.objectContaining({
          phone: "+15551234567",
          shopId: null,
        }),
        update: expect.objectContaining({
          optedOutAt: expect.any(Date),
        }),
      })
    );
  });

  it("normalizes 10-digit phone numbers", async () => {
    mockUpsert.mockResolvedValue({});

    await recordOptOut("5551234567");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "+15551234567" },
        create: expect.objectContaining({
          phone: "+15551234567",
        }),
      })
    );
  });

  it("passes shopId when provided", async () => {
    mockUpsert.mockResolvedValue({});

    await recordOptOut("+15551234567", 42);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          shopId: 42,
        }),
      })
    );
  });
});

describe("removeOptOut", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes by normalized phone number", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await removeOptOut("+15551234567");

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { phone: "+15551234567" },
    });
  });

  it("normalizes phone number before deleting", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await removeOptOut("(555) 123-4567");

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { phone: "+15551234567" },
    });
  });
});

describe("isPhoneOptedOut", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when opt-out record exists", async () => {
    mockFindUnique.mockResolvedValue({
      id: 1,
      phone: "+15551234567",
      optedOutAt: new Date(),
    });

    const result = await isPhoneOptedOut("+15551234567");
    expect(result).toBe(true);
  });

  it("returns false when no opt-out record exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await isPhoneOptedOut("+15551234567");
    expect(result).toBe(false);
  });

  it("normalizes phone number before checking", async () => {
    mockFindUnique.mockResolvedValue(null);

    await isPhoneOptedOut("5551234567");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { phone: "+15551234567" },
    });
  });
});
