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

  const retryDelays = [0, 1, 2].map((i) => {
    const val = formData.get(`retryDelay_${i}`);
    return val !== null ? Number(val) : [15, 720, 2160][i];
  });

  const channelSequence: ("EMAIL" | "SMS" | "NONE")[] = [0, 1, 2].map((i) => {
    const val = formData.get(`channelStep_${i}`);
    if (val === "SMS") return "SMS";
    if (val === "NONE") return "NONE";
    return "EMAIL";
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
      <SettingsForm settings={settings} />
    </div>
  );
}
