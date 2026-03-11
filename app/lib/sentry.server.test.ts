import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockInit = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@sentry/remix", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

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

beforeEach(() => {
  saveEnv("SENTRY_DSN", "NODE_ENV");
});

afterAll(() => {
  restoreEnv();
});

describe("initSentry", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockClear();
  });

  it("warns and skips when SENTRY_DSN is not set", async () => {
    delete process.env.SENTRY_DSN;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { initSentry } = await import("./sentry.server");
    initSentry();

    expect(warnSpy).toHaveBeenCalledWith(
      "SENTRY_DSN not set \u2014 Sentry disabled"
    );
    expect(mockInit).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("calls Sentry.init with correct DSN", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    process.env.NODE_ENV = "development";

    const { initSentry } = await import("./sentry.server");
    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://abc@sentry.io/123",
      })
    );
  });

  it("uses tracesSampleRate 0.1 in production", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    process.env.NODE_ENV = "production";

    const { initSentry } = await import("./sentry.server");
    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.1,
        environment: "production",
      })
    );
  });

  it("uses tracesSampleRate 1.0 in development", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    process.env.NODE_ENV = "development";

    const { initSentry } = await import("./sentry.server");
    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1.0,
        environment: "development",
      })
    );
  });

  it("defaults environment to 'development' when NODE_ENV is not set", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";
    // @ts-expect-error intentionally unsetting NODE_ENV for test
    delete process.env.NODE_ENV;

    const { initSentry } = await import("./sentry.server");
    initSentry();

    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
      })
    );
  });

  it("is idempotent — second call does not re-initialize", async () => {
    process.env.SENTRY_DSN = "https://abc@sentry.io/123";

    const { initSentry } = await import("./sentry.server");
    initSentry();
    initSentry();

    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});

describe("captureException", () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it("delegates to Sentry.captureException", async () => {
    const { captureException } = await import("./sentry.server");
    const error = new Error("test error");

    captureException(error);

    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("handles non-Error objects", async () => {
    const { captureException } = await import("./sentry.server");

    captureException("string error");

    expect(mockCaptureException).toHaveBeenCalledWith("string error");
  });

  it("handles null/undefined", async () => {
    const { captureException } = await import("./sentry.server");

    captureException(null);

    expect(mockCaptureException).toHaveBeenCalledWith(null);
  });
});
