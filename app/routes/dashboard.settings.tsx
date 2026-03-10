import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Prisma } from "@prisma/client";
import { requireShopId } from "~/lib/session.server";
import { findShopById, updateShopSettings } from "~/models/shop.server";
import { SettingsForm } from "~/components/SettingsForm";
import {
  type ShopSettings,
  DEFAULT_SETTINGS,
  parseShopSettings,
} from "~/lib/settings";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopId = await requireShopId(request);
  const shop = await findShopById(shopId);

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const settings = parseShopSettings(shop.settingsJson);

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopId = await requireShopId(request);
  const formData = await request.formData();

  const retryDelays = String(formData.get("retryDelays") || "15,720,2160")
    .split(",")
    .map(Number);

  const channelSequence: ("EMAIL" | "SMS")[] = retryDelays.map((_, i) => {
    const val = formData.get(`channelStep_${i}`);
    return val === "SMS" ? "SMS" : "EMAIL";
  });

  const settings: ShopSettings = {
    recoveryEnabled: formData.has("recoveryEnabled"),
    retryDelays,
    smsEnabled: formData.has("smsEnabled"),
    channelSequence,
    emailTemplates: {
      confirmedDecline: {
        subject: String(
          formData.get("confirmedDeclineSubject") ||
            DEFAULT_SETTINGS.emailTemplates.confirmedDecline.subject
        ),
        body: String(
          formData.get("confirmedDeclineBody") ||
            DEFAULT_SETTINGS.emailTemplates.confirmedDecline.body
        ),
      },
      likelyAbandonment: {
        subject: String(
          formData.get("likelyAbandonmentSubject") ||
            DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.subject
        ),
        body: String(
          formData.get("likelyAbandonmentBody") ||
            DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.body
        ),
      },
    },
    smsTemplates: {
      confirmedDecline: {
        body: String(
          formData.get("smsConfirmedDeclineBody") ||
            DEFAULT_SETTINGS.smsTemplates.confirmedDecline.body
        ),
      },
      likelyAbandonment: {
        body: String(
          formData.get("smsLikelyAbandonmentBody") ||
            DEFAULT_SETTINGS.smsTemplates.likelyAbandonment.body
        ),
      },
    },
  };

  await updateShopSettings(shopId, settings as unknown as Prisma.InputJsonValue);

  return json({ success: true });
}

export default function DashboardSettings() {
  const { settings } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your recovery workflow
        </p>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
