import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();

vi.mock("~/lib/db.server", () => ({
  prisma: {
    shop: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("~/lib/encryption.server", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

import {
  findShopByDomain,
  findShopById,
  upsertShop,
  getAccessToken,
  deactivateShop,
  getActiveShops,
  updateShopSettings,
} from "~/models/shop.server";

describe("findShopByDomain", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns shop when found by domain", async () => {
    const shop = { id: 1, shopDomain: "test.myshopify.com" };
    mockFindUnique.mockResolvedValue(shop);

    const result = await findShopByDomain("test.myshopify.com");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { shopDomain: "test.myshopify.com" },
    });
    expect(result).toEqual(shop);
  });

  it("returns null when shop not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await findShopByDomain("missing.myshopify.com");

    expect(result).toBeNull();
  });
});

describe("findShopById", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns shop when found by ID", async () => {
    const shop = { id: 42, shopDomain: "shop42.myshopify.com" };
    mockFindUnique.mockResolvedValue(shop);

    const result = await findShopById(42);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(result).toEqual(shop);
  });

  it("returns null when shop not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await findShopById(999);

    expect(result).toBeNull();
  });
});

describe("upsertShop", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("encrypts access token and upserts with correct fields", async () => {
    mockEncrypt.mockReturnValue("encrypted_token_abc");
    const shop = { id: 1, shopDomain: "new.myshopify.com" };
    mockUpsert.mockResolvedValue(shop);

    const before = new Date();
    const result = await upsertShop({
      shopDomain: "new.myshopify.com",
      accessToken: "shpat_plaintext",
      apiVersion: "2026-01",
    });
    const after = new Date();

    expect(mockEncrypt).toHaveBeenCalledWith("shpat_plaintext");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { shopDomain: "new.myshopify.com" },
      create: {
        shopDomain: "new.myshopify.com",
        accessTokenEncrypted: "encrypted_token_abc",
        apiVersion: "2026-01",
        installedAt: expect.any(Date),
      },
      update: {
        accessTokenEncrypted: "encrypted_token_abc",
        apiVersion: "2026-01",
        isActive: true,
        uninstalledAt: null,
      },
    });
    const call = mockUpsert.mock.calls[0][0];
    expect(call.create.installedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.create.installedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(result).toEqual(shop);
  });

  it("sets isActive true and uninstalledAt null on update (reinstall)", async () => {
    mockEncrypt.mockReturnValue("encrypted_token_new");
    mockUpsert.mockResolvedValue({ id: 2 });

    await upsertShop({
      shopDomain: "reinstall.myshopify.com",
      accessToken: "shpat_new",
      apiVersion: "2026-04",
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          isActive: true,
          uninstalledAt: null,
        }),
      })
    );
  });
});

describe("getAccessToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("decrypts the access token from the shop record", () => {
    mockDecrypt.mockReturnValue("shpat_decrypted");

    const result = getAccessToken({
      accessTokenEncrypted: "iv:data:tag",
    } as never);

    expect(mockDecrypt).toHaveBeenCalledWith("iv:data:tag");
    expect(result).toBe("shpat_decrypted");
  });
});

describe("deactivateShop", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets isActive false and uninstalledAt timestamp", async () => {
    mockUpdate.mockResolvedValue({});

    const before = new Date();
    await deactivateShop("gone.myshopify.com");
    const after = new Date();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { shopDomain: "gone.myshopify.com" },
      data: {
        isActive: false,
        uninstalledAt: expect.any(Date),
      },
    });
    const call = mockUpdate.mock.calls[0][0];
    expect(call.data.uninstalledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(call.data.uninstalledAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("getActiveShops", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns all active shops", async () => {
    const shops = [
      { id: 1, isActive: true },
      { id: 2, isActive: true },
    ];
    mockFindMany.mockResolvedValue(shops);

    const result = await getActiveShops();

    expect(mockFindMany).toHaveBeenCalledWith({ where: { isActive: true } });
    expect(result).toEqual(shops);
  });

  it("returns empty array when no active shops", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getActiveShops();

    expect(result).toEqual([]);
  });
});

describe("updateShopSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates settings JSON for the given shop ID", async () => {
    const settings = { smsEnabled: true, retryDelays: [5, 15, 30] };
    const updated = { id: 10, settingsJson: settings };
    mockUpdate.mockResolvedValue(updated);

    const result = await updateShopSettings(10, settings);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { settingsJson: settings },
    });
    expect(result).toEqual(updated);
  });

  it("accepts empty object as settings", async () => {
    mockUpdate.mockResolvedValue({ id: 11, settingsJson: {} });

    await updateShopSettings(11, {});

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { settingsJson: {} },
    });
  });
});
