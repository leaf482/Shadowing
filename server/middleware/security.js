import compression from "compression";
import helmet from "helmet";

export function configureSecurity(app) {
  const productionCspEnabled =
    process.env.NODE_ENV === "production" && process.env.CSP_DISABLED !== "true";

  app.use(
    helmet({
      contentSecurityPolicy: productionCspEnabled
        ? {
            useDefaults: false,
            reportOnly: process.env.CSP_REPORT_ONLY === "true",
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https://*.tile.openstreetmap.org",
                "https://tile.openstreetmap.org",
              ],
              connectSrc: [
                "'self'",
                "https://nominatim.openstreetmap.org",
                "https://cognito-idp.us-west-2.amazonaws.com",
                "https://*.amazoncognito.com",
              ],
              fontSrc: ["'self'", "data:"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      hsts:
        process.env.ENABLE_HSTS === "true"
          ? { maxAge: 31_536_000, includeSubDomains: true }
          : false,
    })
  );

  if (process.env.NODE_ENV === "production") {
    app.use(compression());
  }
}
