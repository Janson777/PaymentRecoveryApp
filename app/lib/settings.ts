export interface ShopSettings {
  recoveryEnabled: boolean;
  retryDelays: number[];
  smsEnabled: boolean;
  channelSequence: ("EMAIL" | "SMS")[];
  emailTemplates: {
    confirmedDecline: { subject: string; body: string };
    likelyAbandonment: { subject: string; body: string };
  };
  smsTemplates: {
    confirmedDecline: { body: string };
    likelyAbandonment: { body: string };
  };
}

export const DEFAULT_SETTINGS: ShopSettings = {
  recoveryEnabled: true,
  retryDelays: [15, 720, 2160],
  smsEnabled: false,
  channelSequence: ["EMAIL", "EMAIL", "EMAIL"],
  emailTemplates: {
    confirmedDecline: {
      subject:
        "Your payment didn't go through \u2014 your cart is still saved",
      body: "It looks like your payment didn't complete. Your items are still reserved \u2014 complete your order here.",
    },
    likelyAbandonment: {
      subject: "Looks like you didn't finish checking out",
      body: "Your items are still available. Complete your order here.",
    },
  },
  smsTemplates: {
    confirmedDecline: {
      body: "Your payment didn't go through but your cart is saved! Complete your order: {{recovery_url}}",
    },
    likelyAbandonment: {
      body: "You left items in your cart! Complete your order: {{recovery_url}}",
    },
  },
};

export function parseShopSettings(json: unknown): ShopSettings {
  const partial = (json as Partial<ShopSettings>) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    emailTemplates: {
      confirmedDecline: {
        ...DEFAULT_SETTINGS.emailTemplates.confirmedDecline,
        ...partial.emailTemplates?.confirmedDecline,
      },
      likelyAbandonment: {
        ...DEFAULT_SETTINGS.emailTemplates.likelyAbandonment,
        ...partial.emailTemplates?.likelyAbandonment,
      },
    },
    smsTemplates: {
      confirmedDecline: {
        ...DEFAULT_SETTINGS.smsTemplates.confirmedDecline,
        ...partial.smsTemplates?.confirmedDecline,
      },
      likelyAbandonment: {
        ...DEFAULT_SETTINGS.smsTemplates.likelyAbandonment,
        ...partial.smsTemplates?.likelyAbandonment,
      },
    },
  };
}

export function getChannelForStep(
  settings: ShopSettings,
  stepIndex: number
): "EMAIL" | "SMS" {
  if (!settings.smsEnabled) return "EMAIL";
  return settings.channelSequence[stepIndex] ?? "EMAIL";
}

export function formatDelayLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""}`;
}
