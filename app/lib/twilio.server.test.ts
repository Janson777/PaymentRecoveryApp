import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isOptOutKeyword,
  isOptInKeyword,
  normalizePhone,
  verifyTwilioSignature,
} from "~/lib/twilio.server";

vi.mock("twilio", () => {
  const validateRequest = vi.fn();
  const mockDefault = Object.assign(() => ({}), { validateRequest });
  return { default: mockDefault, Twilio: mockDefault };
});

import Twilio from "twilio";

describe("isOptOutKeyword", () => {
  it.each(["STOP", "stop", "Stop", "STOPALL", "stopall", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])(
    'returns true for "%s"',
    (keyword) => {
      expect(isOptOutKeyword(keyword)).toBe(true);
    }
  );

  it("trims whitespace", () => {
    expect(isOptOutKeyword("  STOP  ")).toBe(true);
    expect(isOptOutKeyword("\nend\n")).toBe(true);
  });

  it.each(["hello", "stopping", "help", "STOPPED", "yes", "start", ""])(
    'returns false for "%s"',
    (text) => {
      expect(isOptOutKeyword(text)).toBe(false);
    }
  );
});

describe("isOptInKeyword", () => {
  it.each(["START", "start", "Start", "YES", "yes", "UNSTOP", "unstop"])(
    'returns true for "%s"',
    (keyword) => {
      expect(isOptInKeyword(keyword)).toBe(true);
    }
  );

  it("trims whitespace", () => {
    expect(isOptInKeyword("  start  ")).toBe(true);
    expect(isOptInKeyword("\tYES\t")).toBe(true);
  });

  it.each(["hello", "starting", "no", "stop", "YESS", ""])(
    'returns false for "%s"',
    (text) => {
      expect(isOptInKeyword(text)).toBe(false);
    }
  );
});

describe("normalizePhone", () => {
  it("returns E.164 numbers unchanged", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("adds +1 to 10-digit US numbers", () => {
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });

  it("adds + to 11-digit numbers starting with 1", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("strips non-digit characters except +", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("handles international numbers", () => {
    expect(normalizePhone("+442071234567")).toBe("+442071234567");
  });

  it("prefixes + for unrecognized formats", () => {
    expect(normalizePhone("442071234567")).toBe("+442071234567");
  });
});

describe("verifyTwilioSignature", () => {
  const mockValidateRequest = Twilio.validateRequest as ReturnType<typeof vi.fn>;
  let savedAuthToken: string | undefined;

  beforeEach(() => {
    savedAuthToken = process.env.TWILIO_AUTH_TOKEN;
    vi.resetAllMocks();
  });

  afterEach(() => {
    if (savedAuthToken !== undefined) {
      process.env.TWILIO_AUTH_TOKEN = savedAuthToken;
    } else {
      delete process.env.TWILIO_AUTH_TOKEN;
    }
  });

  it("throws if TWILIO_AUTH_TOKEN is not set", () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(() =>
      verifyTwilioSignature("sig", "https://example.com", {})
    ).toThrow("TWILIO_AUTH_TOKEN is required");
  });

  it("calls Twilio.validateRequest with correct arguments", () => {
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    mockValidateRequest.mockReturnValue(true);

    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const result = verifyTwilioSignature(
      "test-signature",
      "https://example.com/webhooks/twilio",
      params
    );

    expect(mockValidateRequest).toHaveBeenCalledWith(
      "test-token",
      "test-signature",
      "https://example.com/webhooks/twilio",
      params
    );
    expect(result).toBe(true);
  });

  it("returns false when signature is invalid", () => {
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    mockValidateRequest.mockReturnValue(false);

    const result = verifyTwilioSignature("bad-sig", "https://example.com", {});
    expect(result).toBe(false);
  });
});
