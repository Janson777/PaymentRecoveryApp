import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireShopId = vi.fn();
const mockFindShopById = vi.fn();
const mockUpdateShopSettings = vi.fn();

vi.mock("~/lib/session.server", () => ({
  requireShopId: (...args: unknown[]) => mockRequireShopId(...args),
}));

vi.mock("~/models/shop.server", () => ({
  findShopById: (...args: unknown[]) => mockFindShopById(...args),
  updateShopSettings: (...args: unknown[]) => mockUpdateShopSettings(...args),
}));

import { loader, action } from "~/routes/dashboard.settings";
import { DEFAULT_SETTINGS } from "~/lib/settings";

function buildGetRequest(): Request {
  return new Request("http://localhost:3000/dashboard/settings");
}

function buildFormRequest(fields: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request("http://localhost:3000/dashboard/settings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("dashboard.settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireShopId.mockResolvedValue(10);
    mockFindShopById.mockResolvedValue({
      id: 10,
      shopDomain: "test.myshopify.com",
      settingsJson: null,
    });
    mockUpdateShopSettings.mockResolvedValue(undefined);
  });

  describe("loader", () => {
    it("throws 401 when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );
      const request = buildGetRequest();

      try {
        await loader({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("throws 404 when shop is not found", async () => {
      mockFindShopById.mockResolvedValue(null);
      const request = buildGetRequest();

      try {
        await loader({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(404);
      }
    });

    it("calls findShopById with the authenticated shopId", async () => {
      mockRequireShopId.mockResolvedValue(42);
      mockFindShopById.mockResolvedValue({
        id: 42,
        settingsJson: null,
      });
      const request = buildGetRequest();
      await loader({ request, params: {}, context: {} });

      expect(mockFindShopById).toHaveBeenCalledWith(42);
    });

    it("returns default settings when settingsJson is null", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        settingsJson: null,
      });
      const request = buildGetRequest();
      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("returns merged settings when settingsJson has overrides", async () => {
      mockFindShopById.mockResolvedValue({
        id: 10,
        settingsJson: {
          recoveryEnabled: false,
          retryDelays: [30, 60],
          smsEnabled: true,
        },
      });
      const request = buildGetRequest();
      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data.settings.recoveryEnabled).toBe(false);
      expect(data.settings.retryDelays).toEqual([30, 60]);
      expect(data.settings.smsEnabled).toBe(true);
      expect(data.settings.emailTemplates).toEqual(
        DEFAULT_SETTINGS.emailTemplates
      );
    });
  });

  describe("action", () => {
    it("throws 401 when not authenticated", async () => {
      mockRequireShopId.mockRejectedValue(
        new Response("Unauthorized", { status: 401 })
      );
      const request = buildFormRequest();

      try {
        await action({ request, params: {}, context: {} });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Response);
        expect((e as Response).status).toBe(401);
      }
    });

    it("returns { success: true } on valid submission", async () => {
      const request = buildFormRequest({
        retryDelays: "15,720,2160",
        channelStep_0: "EMAIL",
        channelStep_1: "EMAIL",
        channelStep_2: "EMAIL",
      });
      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(data).toEqual({ success: true });
    });

    it("parses retryDelays from comma-separated form field", async () => {
      const request = buildFormRequest({
        retryDelays: "30,120,1440",
        channelStep_0: "EMAIL",
        channelStep_1: "EMAIL",
        channelStep_2: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.retryDelays).toEqual([30, 120, 1440]);
    });

    it("defaults retryDelays to 15,720,2160 when field is empty", async () => {
      const request = buildFormRequest({
        channelStep_0: "EMAIL",
        channelStep_1: "EMAIL",
        channelStep_2: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.retryDelays).toEqual([15, 720, 2160]);
    });

    it("builds channelSequence from form fields", async () => {
      const request = buildFormRequest({
        retryDelays: "15,720",
        channelStep_0: "SMS",
        channelStep_1: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.channelSequence).toEqual(["SMS", "EMAIL"]);
    });

    it("defaults channel to EMAIL when channelStep field is missing", async () => {
      const request = buildFormRequest({
        retryDelays: "15,720",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.channelSequence).toEqual(["EMAIL", "EMAIL"]);
    });

    it("sets recoveryEnabled true when checkbox is present", async () => {
      const request = buildFormRequest({
        recoveryEnabled: "true",
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.recoveryEnabled).toBe(true);
    });

    it("sets recoveryEnabled false when checkbox is absent", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.recoveryEnabled).toBe(false);
    });

    it("sets smsEnabled true when checkbox is present", async () => {
      const request = buildFormRequest({
        smsEnabled: "true",
        retryDelays: "15",
        channelStep_0: "SMS",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.smsEnabled).toBe(true);
    });

    it("sets smsEnabled false when checkbox is absent", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.smsEnabled).toBe(false);
    });

    it("uses custom email templates from form data", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
        confirmedDeclineSubject: "Custom decline subject",
        confirmedDeclineBody: "Custom decline body",
        likelyAbandonmentSubject: "Custom abandonment subject",
        likelyAbandonmentBody: "Custom abandonment body",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.emailTemplates).toEqual({
        confirmedDecline: {
          subject: "Custom decline subject",
          body: "Custom decline body",
        },
        likelyAbandonment: {
          subject: "Custom abandonment subject",
          body: "Custom abandonment body",
        },
      });
    });

    it("falls back to default email templates when fields are empty", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.emailTemplates).toEqual({
        confirmedDecline: {
          subject: DEFAULT_SETTINGS.emailTemplates.confirmedDecline.subject,
          body: DEFAULT_SETTINGS.emailTemplates.confirmedDecline.body,
        },
        likelyAbandonment: {
          subject: DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.subject,
          body: DEFAULT_SETTINGS.emailTemplates.likelyAbandonment.body,
        },
      });
    });

    it("uses custom SMS templates from form data", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "SMS",
        smsConfirmedDeclineBody: "Custom SMS decline",
        smsLikelyAbandonmentBody: "Custom SMS abandonment",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.smsTemplates).toEqual({
        confirmedDecline: { body: "Custom SMS decline" },
        likelyAbandonment: { body: "Custom SMS abandonment" },
      });
    });

    it("falls back to default SMS templates when fields are empty", async () => {
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg.smsTemplates).toEqual({
        confirmedDecline: {
          body: DEFAULT_SETTINGS.smsTemplates.confirmedDecline.body,
        },
        likelyAbandonment: {
          body: DEFAULT_SETTINGS.smsTemplates.likelyAbandonment.body,
        },
      });
    });

    it("calls updateShopSettings with correct shopId", async () => {
      mockRequireShopId.mockResolvedValue(77);
      const request = buildFormRequest({
        retryDelays: "15",
        channelStep_0: "EMAIL",
      });
      await action({ request, params: {}, context: {} });

      expect(mockUpdateShopSettings).toHaveBeenCalledWith(
        77,
        expect.any(Object)
      );
    });

    it("constructs full settings object with all fields", async () => {
      const request = buildFormRequest({
        recoveryEnabled: "true",
        retryDelays: "10,60",
        smsEnabled: "true",
        channelStep_0: "SMS",
        channelStep_1: "EMAIL",
        confirmedDeclineSubject: "Decline subj",
        confirmedDeclineBody: "Decline body",
        likelyAbandonmentSubject: "Abandon subj",
        likelyAbandonmentBody: "Abandon body",
        smsConfirmedDeclineBody: "SMS decline",
        smsLikelyAbandonmentBody: "SMS abandon",
      });
      await action({ request, params: {}, context: {} });

      const settingsArg = mockUpdateShopSettings.mock.calls[0][1];
      expect(settingsArg).toEqual({
        recoveryEnabled: true,
        retryDelays: [10, 60],
        smsEnabled: true,
        channelSequence: ["SMS", "EMAIL"],
        emailTemplates: {
          confirmedDecline: {
            subject: "Decline subj",
            body: "Decline body",
          },
          likelyAbandonment: {
            subject: "Abandon subj",
            body: "Abandon body",
          },
        },
        smsTemplates: {
          confirmedDecline: { body: "SMS decline" },
          likelyAbandonment: { body: "SMS abandon" },
        },
      });
    });
  });
});
