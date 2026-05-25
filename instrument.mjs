/**
 * Load before application modules (Node 18.19+): `node --import ./instrument.mjs server/index.js`
 * Lambda: imported from lambda-handler.mjs
 */
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
    sendDefaultPii: false,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
  });
}
