import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const mockMessagesCreate = vi.fn();

vi.mock("twilio", () => {
  const mockTwilio = vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockMessagesCreate(...args),
    },
  }));
  return { default: mockTwilio };
});

import { sendRecoverySMS } from "./sms.server";

const savedEnv: Record<string, string | undefined> = {};

function saveEnv(...keys: string[]) {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("sendRecoverySMS", () => {
  beforeAll(() => {
    saveEnv(
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
      "APP_URL"
    );
  });

  beforeEach(() => {
    mockMessagesCreate.mockClear();
    mockMessagesCreate.mockResolvedValue({ sid: "SM-test-001" });
  });

  afterAll(() => {
    restoreEnv();
  });

  describe("initialization errors", () => {
    it("throws when TWILIO_FROM_NUMBER is not set", async () => {
      delete process.env.TWILIO_FROM_NUMBER;
      process.env.TWILIO_ACCOUNT_SID = "AC_test";
      process.env.TWILIO_AUTH_TOKEN = "auth_test";

      await expect(
        sendRecoverySMS({ to: "+15551234567", body: "Test" })
      ).rejects.toThrow("TWILIO_FROM_NUMBER is required");

      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it("throws when TWILIO_ACCOUNT_SID is not set", async () => {
      process.env.TWILIO_FROM_NUMBER = "+15559999999";
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      await expect(
        sendRecoverySMS({ to: "+15551234567", body: "Test" })
      ).rejects.toThrow(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"
      );
    });

    it("throws when TWILIO_AUTH_TOKEN is not set", async () => {
      process.env.TWILIO_FROM_NUMBER = "+15559999999";
      process.env.TWILIO_ACCOUNT_SID = "AC_test";
      delete process.env.TWILIO_AUTH_TOKEN;

      await expect(
        sendRecoverySMS({ to: "+15551234567", body: "Test" })
      ).rejects.toThrow(
        "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"
      );
    });
  });

  describe("sending SMS", () => {
    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
      process.env.TWILIO_AUTH_TOKEN = "test_auth_token";
      process.env.TWILIO_FROM_NUMBER = "+15559999999";
    });

    it("sends SMS with correct parameters and returns SID", async () => {
      mockMessagesCreate.mockResolvedValue({ sid: "SM-abc123" });

      const result = await sendRecoverySMS({
        to: "+15551234567",
        body: "Your payment was declined. Complete your order: https://shop.com/recover/abc",
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        body: "Your payment was declined. Complete your order: https://shop.com/recover/abc",
        from: "+15559999999",
        to: "+15551234567",
        statusCallback: expect.any(String),
      });
      expect(result).toBe("SM-abc123");
    });

    it("uses APP_URL env var for statusCallback", async () => {
      process.env.APP_URL = "https://app.example.com";

      await sendRecoverySMS({
        to: "+15551234567",
        body: "Test message",
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCallback: "https://app.example.com/webhooks/twilio",
        })
      );
    });

    it("falls back to localhost when APP_URL is not set", async () => {
      delete process.env.APP_URL;

      await sendRecoverySMS({
        to: "+15551234567",
        body: "Test message",
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCallback: "http://localhost:3000/webhooks/twilio",
        })
      );
    });

    it("uses TWILIO_FROM_NUMBER as the sender", async () => {
      process.env.TWILIO_FROM_NUMBER = "+18005551234";

      await sendRecoverySMS({
        to: "+15551234567",
        body: "Test",
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "+18005551234",
        })
      );
    });

    it("passes the message body through unchanged", async () => {
      const body =
        "Hi! Your payment was declined. Try again here: https://shop.com/recover/abc {{recovery_url}}";

      await sendRecoverySMS({
        to: "+15551234567",
        body,
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ body })
      );
    });

    it("passes the recipient number through unchanged", async () => {
      await sendRecoverySMS({
        to: "+447911123456",
        body: "International test",
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+447911123456" })
      );
    });
  });
});
