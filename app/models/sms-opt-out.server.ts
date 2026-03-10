import { prisma } from "~/lib/db.server";
import { normalizePhone } from "~/lib/twilio.server";

export async function recordOptOut(
  phone: string,
  shopId?: number
): Promise<void> {
  const normalized = normalizePhone(phone);
  await prisma.smsOptOut.upsert({
    where: { phone: normalized },
    create: {
      phone: normalized,
      shopId: shopId ?? null,
      optedOutAt: new Date(),
    },
    update: {
      optedOutAt: new Date(),
    },
  });
}

export async function removeOptOut(phone: string): Promise<void> {
  const normalized = normalizePhone(phone);
  await prisma.smsOptOut.deleteMany({
    where: { phone: normalized },
  });
}

export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const record = await prisma.smsOptOut.findUnique({
    where: { phone: normalized },
  });
  return record !== null;
}
