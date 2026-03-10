import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  parseShopSettings,
  getChannelForStep,
  formatDelayLabel,
} from "./settings";
import type { ShopSettings } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("has recoveryEnabled true by default", () => {
    expect(DEFAULT_SETTINGS.recoveryEnabled).toBe(true);
  });

  it("has smsEnabled false by default", () => {
    expect(DEFAULT_SETTINGS.smsEnabled).toBe(false);
  });

  it("has three retry delays", () => {
    expect(DEFAULT_SETTINGS.retryDelays).toEqual([15, 720, 2160]);
  });

  it("has all-EMAIL channel sequence", () => {
    expect(DEFAULT_SETTINGS.channelSequence).toEqual([
      "EMAIL",
      "EMAIL",
      "EMAIL",
    ]);
  });

  it("has email templates for both decline types", () => {
    expect(DEFAULT_SETTINGS.emailTemplates.confirmedDecline.subject).toBeTruthy();
    expect(DEFAULT_SETTINGS.emailTemplates.confirmedDecline.body).toBeTruthy();
    expect(DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.subject).toBeTruthy();
    expect(DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.body).toBeTruthy();
  });

  it("has SMS templates for both decline types", () => {
    expect(DEFAULT_SETTINGS.smsTemplates.confirmedDecline.body).toContain(
      "{{recovery_url}}"
    );
    expect(DEFAULT_SETTINGS.smsTemplates.likelyAbandonment.body).toContain(
      "{{recovery_url}}"
    );
  });
});

describe("parseShopSettings", () => {
  it("returns defaults for null input", () => {
    const result = parseShopSettings(null);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for undefined input", () => {
    const result = parseShopSettings(undefined);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for empty object", () => {
    const result = parseShopSettings({});
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("overrides top-level boolean fields", () => {
    const result = parseShopSettings({
      recoveryEnabled: false,
      smsEnabled: true,
    });

    expect(result.recoveryEnabled).toBe(false);
    expect(result.smsEnabled).toBe(true);
  });

  it("overrides retryDelays", () => {
    const result = parseShopSettings({
      retryDelays: [30, 60],
    });

    expect(result.retryDelays).toEqual([30, 60]);
  });

  it("overrides channelSequence", () => {
    const result = parseShopSettings({
      channelSequence: ["SMS", "EMAIL", "SMS"],
    });

    expect(result.channelSequence).toEqual(["SMS", "EMAIL", "SMS"]);
  });

  it("deep merges email templates — overrides only specified fields", () => {
    const result = parseShopSettings({
      emailTemplates: {
        confirmedDecline: {
          subject: "Custom subject",
        },
      },
    });

    expect(result.emailTemplates.confirmedDecline.subject).toBe(
      "Custom subject"
    );
    expect(result.emailTemplates.confirmedDecline.body).toBe(
      DEFAULT_SETTINGS.emailTemplates.confirmedDecline.body
    );
    expect(result.emailTemplates.likelyAbandonment).toEqual(
      DEFAULT_SETTINGS.emailTemplates.likelyAbandonment
    );
  });

  it("deep merges SMS templates — overrides only specified fields", () => {
    const result = parseShopSettings({
      smsTemplates: {
        likelyAbandonment: {
          body: "Custom SMS body {{recovery_url}}",
        },
      },
    });

    expect(result.smsTemplates.likelyAbandonment.body).toBe(
      "Custom SMS body {{recovery_url}}"
    );
    expect(result.smsTemplates.confirmedDecline).toEqual(
      DEFAULT_SETTINGS.smsTemplates.confirmedDecline
    );
  });

  it("preserves non-overridden defaults alongside overrides", () => {
    const result = parseShopSettings({
      recoveryEnabled: false,
    });

    expect(result.recoveryEnabled).toBe(false);
    expect(result.smsEnabled).toBe(DEFAULT_SETTINGS.smsEnabled);
    expect(result.retryDelays).toEqual(DEFAULT_SETTINGS.retryDelays);
    expect(result.channelSequence).toEqual(DEFAULT_SETTINGS.channelSequence);
  });

  it("handles full override of all fields", () => {
    const custom: ShopSettings = {
      recoveryEnabled: false,
      retryDelays: [5],
      smsEnabled: true,
      channelSequence: ["SMS"],
      emailTemplates: {
        confirmedDecline: { subject: "A", body: "B" },
        likelyAbandonment: { subject: "C", body: "D" },
      },
      smsTemplates: {
        confirmedDecline: { body: "E" },
        likelyAbandonment: { body: "F" },
      },
    };

    const result = parseShopSettings(custom);
    expect(result).toEqual(custom);
  });
});

describe("getChannelForStep", () => {
  it("returns EMAIL when smsEnabled is false regardless of sequence", () => {
    const settings: ShopSettings = {
      ...DEFAULT_SETTINGS,
      smsEnabled: false,
      channelSequence: ["SMS", "SMS", "SMS"],
    };

    expect(getChannelForStep(settings, 0)).toBe("EMAIL");
    expect(getChannelForStep(settings, 1)).toBe("EMAIL");
    expect(getChannelForStep(settings, 2)).toBe("EMAIL");
  });

  it("returns channel from sequence when smsEnabled is true", () => {
    const settings: ShopSettings = {
      ...DEFAULT_SETTINGS,
      smsEnabled: true,
      channelSequence: ["EMAIL", "SMS", "EMAIL"],
    };

    expect(getChannelForStep(settings, 0)).toBe("EMAIL");
    expect(getChannelForStep(settings, 1)).toBe("SMS");
    expect(getChannelForStep(settings, 2)).toBe("EMAIL");
  });

  it("returns EMAIL for out-of-bounds index when smsEnabled", () => {
    const settings: ShopSettings = {
      ...DEFAULT_SETTINGS,
      smsEnabled: true,
      channelSequence: ["SMS"],
    };

    expect(getChannelForStep(settings, 5)).toBe("EMAIL");
  });

  it("returns first channel for index 0", () => {
    const settings: ShopSettings = {
      ...DEFAULT_SETTINGS,
      smsEnabled: true,
      channelSequence: ["SMS", "EMAIL"],
    };

    expect(getChannelForStep(settings, 0)).toBe("SMS");
  });
});

describe("formatDelayLabel", () => {
  it("formats minutes under 60 as minutes", () => {
    expect(formatDelayLabel(15)).toBe("15 min");
  });

  it("formats 1 minute", () => {
    expect(formatDelayLabel(1)).toBe("1 min");
  });

  it("formats 59 minutes", () => {
    expect(formatDelayLabel(59)).toBe("59 min");
  });

  it("formats exactly 60 minutes as 1 hr", () => {
    expect(formatDelayLabel(60)).toBe("1 hr");
  });

  it("formats multiple hours with plural", () => {
    expect(formatDelayLabel(720)).toBe("12 hrs");
  });

  it("formats 2 hours", () => {
    expect(formatDelayLabel(120)).toBe("2 hrs");
  });

  it("formats exactly 24 hours as 1 day", () => {
    expect(formatDelayLabel(1440)).toBe("1 day");
  });

  it("formats multiple days with plural", () => {
    expect(formatDelayLabel(2880)).toBe("2 days");
  });

  it("formats 3 days (2160 min = 36 hrs)", () => {
    expect(formatDelayLabel(2160)).toBe("2 days");
  });

  it("rounds hours correctly", () => {
    expect(formatDelayLabel(90)).toBe("2 hrs");
  });
});
