import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "./encryption.server";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let savedKey: string | undefined;

beforeAll(() => {
  savedKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = TEST_KEY_HEX;
});

afterAll(() => {
  if (savedKey === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = savedKey;
  }
});

describe("encrypt", () => {
  it("returns ciphertext in iv:data:tag format", () => {
    const result = encrypt("hello world");
    const parts = result.split(":");

    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBe(32); // 16 bytes IV = 32 hex chars
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBe(32); // 16 bytes auth tag = 32 hex chars
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");

    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const result = encrypt("");
    const parts = result.split(":");

    expect(parts).toHaveLength(3);
  });

  it("handles unicode content", () => {
    const result = encrypt("café \u{1F600} emoji");
    const parts = result.split(":");

    expect(parts).toHaveLength(3);
  });

  it("throws when ENCRYPTION_KEY is not set", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    try {
      expect(() => encrypt("test")).toThrow(
        "ENCRYPTION_KEY environment variable is required"
      );
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});

describe("decrypt", () => {
  it("roundtrips with encrypt for plain text", () => {
    const plaintext = "shpat_abc123_access_token";
    const ciphertext = encrypt(plaintext);

    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("roundtrips with encrypt for unicode content", () => {
    const plaintext = "café \u{1F600} emoji data";
    const ciphertext = encrypt(plaintext);

    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("throws on encrypted empty string (empty data part is falsy)", () => {
    const ciphertext = encrypt("");

    expect(() => decrypt(ciphertext)).toThrow("Invalid ciphertext format");
  });

  it("roundtrips with encrypt for long content", () => {
    const plaintext = "x".repeat(10000);
    const ciphertext = encrypt(plaintext);

    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("throws on invalid ciphertext format — missing parts", () => {
    expect(() => decrypt("onlyonepart")).toThrow("Invalid ciphertext format");
  });

  it("throws on invalid ciphertext format — two parts", () => {
    expect(() => decrypt("part1:part2")).toThrow("Invalid ciphertext format");
  });

  it("throws on tampered encrypted data", () => {
    const ciphertext = encrypt("secret data");
    const [iv, encrypted, tag] = ciphertext.split(":");
    const tampered = encrypted.slice(0, -2) + "ff";

    expect(() => decrypt(`${iv}:${tampered}:${tag}`)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const ciphertext = encrypt("secret data");
    const [iv, encrypted, tag] = ciphertext.split(":");
    const tamperedTag = tag.slice(0, -2) + "ff";

    expect(() => decrypt(`${iv}:${encrypted}:${tamperedTag}`)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    try {
      expect(() => decrypt("aa:bb:cc")).toThrow(
        "ENCRYPTION_KEY environment variable is required"
      );
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});
