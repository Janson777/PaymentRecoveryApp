import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const mockSendEmail = vi.fn();

vi.mock("postmark", () => ({
  ServerClient: vi.fn().mockImplementation(() => ({
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  })),
}));

import { sendRecoveryEmail } from "./email.server";

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

describe("sendRecoveryEmail", () => {
  beforeAll(() => {
    saveEnv("POSTMARK_API_TOKEN", "POSTMARK_FROM_EMAIL");
  });

  beforeEach(() => {
    mockSendEmail.mockClear();
    mockSendEmail.mockResolvedValue({ MessageID: "msg-001" });
  });

  afterAll(() => {
    restoreEnv();
  });

  describe("initialization", () => {
    it("throws when POSTMARK_API_TOKEN is not set", async () => {
      delete process.env.POSTMARK_API_TOKEN;

      await expect(
        sendRecoveryEmail({
          to: "test@example.com",
          subject: "Test",
          body: "Hello",
          recoveryUrl: "https://shop.com/recover/abc",
        })
      ).rejects.toThrow("POSTMARK_API_TOKEN is required");

      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("sending emails", () => {
    beforeEach(() => {
      process.env.POSTMARK_API_TOKEN = "test-pm-token";
    });

    it("sends email with correct parameters and returns MessageID", async () => {
      mockSendEmail.mockResolvedValue({ MessageID: "msg-abc123" });

      const result = await sendRecoveryEmail({
        to: "customer@example.com",
        subject: "Complete your order",
        body: "Your payment didn't go through.",
        recoveryUrl: "https://shop.com/checkout/recover/abc123",
      });

      expect(mockSendEmail).toHaveBeenCalledWith({
        From: expect.any(String),
        To: "customer@example.com",
        Subject: "Complete your order",
        HtmlBody: expect.any(String),
        TextBody: expect.any(String),
        MessageStream: "outbound",
      });
      expect(result).toBe("msg-abc123");
    });

    it("uses POSTMARK_FROM_EMAIL env var for sender", async () => {
      process.env.POSTMARK_FROM_EMAIL = "recovery@myshop.com";

      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: "recovery@myshop.com",
        })
      );
    });

    it("falls back to default from email when env var is not set", async () => {
      delete process.env.POSTMARK_FROM_EMAIL;

      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: "noreply@yourdomain.com",
        })
      );
    });

    it("builds text body with recovery URL", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Finish checkout",
        body: "We noticed an issue with your payment.",
        recoveryUrl: "https://shop.com/checkout/recover/xyz",
      });

      const call = mockSendEmail.mock.calls[0][0];
      expect(call.TextBody).toBe(
        "We noticed an issue with your payment.\n\nComplete your order: https://shop.com/checkout/recover/xyz"
      );
    });

    it("builds HTML body with recovery URL button", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Payment failed.",
        recoveryUrl: "https://shop.com/checkout/recover/html-test",
      });

      const call = mockSendEmail.mock.calls[0][0];
      const html = call.HtmlBody as string;
      expect(html).toContain("Payment failed.");
      expect(html).toContain('href="https://shop.com/checkout/recover/html-test"');
      expect(html).toContain("Complete Your Order");
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("includes tracking pixel when trackingUrl is provided", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
        trackingUrl: "https://app.example.com/track/msg-123",
      });

      const call = mockSendEmail.mock.calls[0][0];
      const html = call.HtmlBody as string;
      expect(html).toContain(
        '<img src="https://app.example.com/track/msg-123" width="1" height="1"'
      );
    });

    it("excludes tracking pixel when trackingUrl is not provided", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
      });

      const call = mockSendEmail.mock.calls[0][0];
      const html = call.HtmlBody as string;
      expect(html).not.toContain("<img");
    });

    it("includes ignore-if-purchased disclaimer in HTML", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
      });

      const call = mockSendEmail.mock.calls[0][0];
      const html = call.HtmlBody as string;
      expect(html).toContain(
        "If you've already completed your purchase, please ignore this email."
      );
    });

    it("sends to outbound message stream", async () => {
      await sendRecoveryEmail({
        to: "buyer@example.com",
        subject: "Test",
        body: "Hello",
        recoveryUrl: "https://shop.com/recover/abc",
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          MessageStream: "outbound",
        })
      );
    });
  });
});
