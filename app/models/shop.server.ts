import type { Shop } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { encrypt, decrypt } from "~/lib/encryption.server";

export async function findShopByDomain(
  shopDomain: string
): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { shopDomain } });
}

export async function findShopById(id: number): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { id } });
}

export async function upsertShop(params: {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
}): Promise<Shop> {
  const accessTokenEncrypted = encrypt(params.accessToken);

  return prisma.shop.upsert({
    where: { shopDomain: params.shopDomain },
    create: {
      shopDomain: params.shopDomain,
      accessTokenEncrypted,
      apiVersion: params.apiVersion,
      installedAt: new Date(),
    },
    update: {
      accessTokenEncrypted,
      apiVersion: params.apiVersion,
      isActive: true,
      uninstalledAt: null,
    },
  });
}

export function getAccessToken(shop: Shop): string {
  return decrypt(shop.accessTokenEncrypted);
}

export async function deactivateShop(shopDomain: string): Promise<void> {
  await prisma.shop.update({
    where: { shopDomain },
    data: { isActive: false, uninstalledAt: new Date() },
  });
}

export async function getActiveShops(): Promise<Shop[]> {
  return prisma.shop.findMany({ where: { isActive: true } });
}

export async function updateShopSettings(
  shopId: number,
  settings: Prisma.InputJsonValue
): Promise<Shop> {
  return prisma.shop.update({
    where: { id: shopId },
    data: { settingsJson: settings },
  });
}
