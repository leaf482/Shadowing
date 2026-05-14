import * as Sentry from "@sentry/react";

/** Called only when `VITE_SENTRY_DSN` is set at build time. */
export function initBrowserSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || "0"),
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}
