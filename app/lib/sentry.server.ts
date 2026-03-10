import * as Sentry from "@sentry/remix";

let initialized = false;

export function initSentry() {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn("SENTRY_DSN not set — Sentry disabled");
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    environment: process.env.NODE_ENV || "development",
  });

  initialized = true;
}

export function captureException(error: unknown) {
  Sentry.captureException(error);
}
