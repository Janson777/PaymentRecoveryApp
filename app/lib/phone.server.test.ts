import { describe, it, expect } from "vitest";
import { normalizePhoneValue, pickFirstNonEmptyPhone } from "~/lib/phone.server";

describe("normalizePhoneValue", () => {
  it("returns undefined for null", () => {
    expect(normalizePhoneValue(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normalizePhoneValue(undefined)).toBeUndefined();
  });

  it("returns undefined for numbers", () => {
    expect(normalizePhoneValue(5551234567)).toBeUndefined();
  });

  it("returns undefined for objects", () => {
    expect(normalizePhoneValue({ phone: "+15551234567" })).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizePhoneValue("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizePhoneValue("   ")).toBeUndefined();
    expect(normalizePhoneValue("\t\n  ")).toBeUndefined();
  });

  it("returns the trimmed string for a valid value", () => {
    expect(normalizePhoneValue("+15551234567")).toBe("+15551234567");
    expect(normalizePhoneValue("  +15551234567  ")).toBe("+15551234567");
    expect(normalizePhoneValue("\t+15551234567\n")).toBe("+15551234567");
  });

  it("does not reformat the phone (E.164 is a separate concern)", () => {
    // Unlike `normalizePhone` in twilio.server, this helper preserves the
    // original format — it only trims whitespace.
    expect(normalizePhoneValue("(555) 123-4567")).toBe("(555) 123-4567");
    expect(normalizePhoneValue("555.123.4567")).toBe("555.123.4567");
  });
});

describe("pickFirstNonEmptyPhone", () => {
  it("returns undefined for an empty array", () => {
    expect(pickFirstNonEmptyPhone([])).toBeUndefined();
  });

  it("returns undefined when all values are nullish or empty", () => {
    expect(
      pickFirstNonEmptyPhone([null, undefined, "", "   "])
    ).toBeUndefined();
  });

  it("returns the first non-empty value", () => {
    expect(
      pickFirstNonEmptyPhone([null, "", "+15551234567", "+15559999999"])
    ).toBe("+15551234567");
  });

  it("prefers earlier candidates even when later ones are also valid", () => {
    expect(
      pickFirstNonEmptyPhone(["+15550000001", "+15550000002", "+15550000003"])
    ).toBe("+15550000001");
  });

  it("skips whitespace-only and empty-string candidates", () => {
    expect(
      pickFirstNonEmptyPhone(["", "  ", "\t", "+15551234567"])
    ).toBe("+15551234567");
  });

  it("trims the returned value", () => {
    expect(pickFirstNonEmptyPhone(["  +15551234567  "])).toBe("+15551234567");
  });

  it("ignores non-string values", () => {
    expect(
      pickFirstNonEmptyPhone([123, { phone: "x" }, true, "+15551234567"])
    ).toBe("+15551234567");
  });
});
