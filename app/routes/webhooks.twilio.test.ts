import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyTwilioSignature = vi.fn();
const mockIsOptOutKeyword = vi.fn();
const mockIsOptInKeyword = vi.fn();
const mockUpdateDeliveryStatus = vi.fn();
const mockRecordOptOut = vi.fn();
const mockRemoveOptOut = vi.fn();

vi.mock("~/lib/twilio.server", () => ({
  verifyTwilioSignature: (...args: unknown[]) =>
    mockVerifyTwilioSignature(...args),
  isOptOutKeyword: (...args: unknown[]) => mockIsOptOutKeyword(...args),
  isOptInKeyword: (...args: unknown[]) => mockIsOptInKeyword(...args),
}));

vi.mock("~/models/recovery-message.server", () => ({
  updateDeliveryStatus: (...args: unknown[]) =>
    mockUpdateDeliveryStatus(...args),
}));

vi.mock("~/models/sms-opt-out.server", () => ({
  recordOptOut: (...args: unknown[]) => mockRecordOptOut(...args),
  removeOptOut: (...args: unknown[]) => mockRemoveOptOut(...args),
}));

import { action } from "~/routes/webhooks.twilio";

function buildRequest(
  params: Record<string, string>,
  options: { method?: string; signature?: string | null } = {}
): Request {
  const { method = "POST", signature = "valid-sig" } = options;
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  });
  if (signature !== null) {
    headers.set("X-Twilio-Signature", signature);
  }
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new URLSearchParams(params).toString();
  }
  return new Request("http://localhost:3000/webhooks/twilio", init);
}

describe("webhooks.twilio action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_URL = "http://localhost:3000";
    mockVerifyTwilioSignature.mockReturnValue(true);
    mockUpdateDeliveryStatus.mockResolvedValue(undefined);
    mockRecordOptOut.mockResolvedValue(undefined);
    mockRemoveOptOut.mockResolvedValue(undefined);
  });

  describe("request validation", () => {
    it("returns 405 for non-POST requests", async () => {
      const request = buildRequest({}, { method: "GET" });
      const response = await action({
        request,
        params: {},
        context: {},
      });
      expect(response.status).toBe(405);
    });

    it("returns 401 when X-Twilio-Signature header is missing", async () => {
      const request = buildRequest(
        { MessageSid: "SM123", MessageStatus: "delivered" },
        { signature: null }
      );
      const response = await action({
        request,
        params: {},
        context: {},
      });
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Missing signature");
    });

    it("returns 401 when signature verification fails", async () => {
      mockVerifyTwilioSignature.mockReturnValue(false);
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "delivered",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("Invalid signature");
    });

    it("passes correct URL and params to verifyTwilioSignature", async () => {
      const formParams = {
        MessageSid: "SM123",
        MessageStatus: "delivered",
      };
      const request = buildRequest(formParams, { signature: "test-sig" });
      await action({ request, params: {}, context: {} });

      expect(mockVerifyTwilioSignature).toHaveBeenCalledWith(
        "test-sig",
        "http://localhost:3000/webhooks/twilio",
        formParams
      );
    });
  });

  describe("delivery status callbacks", () => {
    it("updates delivery status when MessageStatus is present", async () => {
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "delivered",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });

      expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith(
        "SM123",
        "delivered"
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/xml");
    });

    it("handles failed delivery with error code", async () => {
      const request = buildRequest({
        MessageSid: "SM456",
        MessageStatus: "failed",
        ErrorCode: "30006",
      });
      await action({ request, params: {}, context: {} });

      expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith(
        "SM456",
        "failed"
      );
    });

    it("handles all Twilio delivery statuses", async () => {
      for (const status of [
        "queued",
        "sending",
        "sent",
        "delivered",
        "undelivered",
        "failed",
      ]) {
        mockUpdateDeliveryStatus.mockClear();
        const request = buildRequest({
          MessageSid: "SM789",
          MessageStatus: status,
        });
        await action({ request, params: {}, context: {} });
        expect(mockUpdateDeliveryStatus).toHaveBeenCalledWith("SM789", status);
      }
    });

    it("returns valid TwiML response", async () => {
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "delivered",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });
      const body = await response.text();
      expect(body).toContain("<Response></Response>");
      expect(body).toContain('<?xml version="1.0"');
    });
  });

  describe("incoming STOP messages (opt-out)", () => {
    it("records opt-out when STOP keyword is detected", async () => {
      mockIsOptOutKeyword.mockReturnValue(true);
      mockIsOptInKeyword.mockReturnValue(false);

      const request = buildRequest({
        From: "+15551234567",
        To: "+15559876543",
        Body: "STOP",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });

      expect(mockRecordOptOut).toHaveBeenCalledWith("+15551234567");
      expect(response.status).toBe(200);
    });

    it("does not call removeOptOut for STOP messages", async () => {
      mockIsOptOutKeyword.mockReturnValue(true);
      mockIsOptInKeyword.mockReturnValue(false);

      const request = buildRequest({
        From: "+15551234567",
        To: "+15559876543",
        Body: "STOP",
      });
      await action({ request, params: {}, context: {} });

      expect(mockRemoveOptOut).not.toHaveBeenCalled();
    });
  });

  describe("incoming START messages (opt-in)", () => {
    it("removes opt-out when START keyword is detected", async () => {
      mockIsOptOutKeyword.mockReturnValue(false);
      mockIsOptInKeyword.mockReturnValue(true);

      const request = buildRequest({
        From: "+15551234567",
        To: "+15559876543",
        Body: "START",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });

      expect(mockRemoveOptOut).toHaveBeenCalledWith("+15551234567");
      expect(response.status).toBe(200);
    });

    it("does not call recordOptOut for START messages", async () => {
      mockIsOptOutKeyword.mockReturnValue(false);
      mockIsOptInKeyword.mockReturnValue(true);

      const request = buildRequest({
        From: "+15551234567",
        To: "+15559876543",
        Body: "START",
      });
      await action({ request, params: {}, context: {} });

      expect(mockRecordOptOut).not.toHaveBeenCalled();
    });
  });

  describe("other incoming messages", () => {
    it("does not record opt-out or opt-in for regular messages", async () => {
      mockIsOptOutKeyword.mockReturnValue(false);
      mockIsOptInKeyword.mockReturnValue(false);

      const request = buildRequest({
        From: "+15551234567",
        To: "+15559876543",
        Body: "Hello, I have a question",
      });
      const response = await action({
        request,
        params: {},
        context: {},
      });

      expect(mockRecordOptOut).not.toHaveBeenCalled();
      expect(mockRemoveOptOut).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe("edge cases", () => {
    it("does not call updateDeliveryStatus for incoming messages", async () => {
      mockIsOptOutKeyword.mockReturnValue(false);
      mockIsOptInKeyword.mockReturnValue(false);

      const request = buildRequest({
        From: "+15551234567",
        Body: "hi",
      });
      await action({ request, params: {}, context: {} });

      expect(mockUpdateDeliveryStatus).not.toHaveBeenCalled();
    });

    it("does not call opt-out handlers for status callbacks", async () => {
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "delivered",
      });
      await action({ request, params: {}, context: {} });

      expect(mockRecordOptOut).not.toHaveBeenCalled();
      expect(mockRemoveOptOut).not.toHaveBeenCalled();
    });

    it("uses APP_URL env var for webhook URL construction", async () => {
      process.env.APP_URL = "https://myapp.example.com";
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "sent",
      });
      await action({ request, params: {}, context: {} });

      expect(mockVerifyTwilioSignature).toHaveBeenCalledWith(
        expect.any(String),
        "https://myapp.example.com/webhooks/twilio",
        expect.any(Object)
      );
    });

    it("falls back to localhost:3000 when APP_URL is not set", async () => {
      delete process.env.APP_URL;
      const request = buildRequest({
        MessageSid: "SM123",
        MessageStatus: "sent",
      });
      await action({ request, params: {}, context: {} });

      expect(mockVerifyTwilioSignature).toHaveBeenCalledWith(
        expect.any(String),
        "http://localhost:3000/webhooks/twilio",
        expect.any(Object)
      );
    });
  });
});
