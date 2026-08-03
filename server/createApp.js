import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRepositories } from "./repositories/createRepositories.js";
import { API_GATEWAY_STAGE } from "./lib/env.js";
import { createClinicsSnapshotRefresher } from "./lib/clinicsSnapshot.js";
import { createAuditWriter } from "./lib/audit.js";
import { createAuthHelpers } from "./middleware/auth.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { apiGatewayStageMiddleware } from "./middleware/apiGatewayStage.js";
import { configureSecurity } from "./middleware/security.js";
import { registerClinicsRoutes } from "./routes/clinics.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerExperiencesRoutes } from "./routes/experiences.js";
import { registerProjectsRoutes } from "./routes/projects.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerAuthRoutes } from "./routes/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  configureSecurity(app);
  app.use(requestIdMiddleware);

  if (process.env.AWS_EXECUTION_ENV && API_GATEWAY_STAGE && API_GATEWAY_STAGE !== "$default") {
    app.use(apiGatewayStageMiddleware);
  }

  app.use(express.json({ limit: "512kb" }));

  if (!process.env.AWS_EXECUTION_ENV) {
    app.use(
      express.static(join(__dirname, "../dist"), {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          if (process.env.NODE_ENV !== "production") return;
          const normalized = filePath.replace(/\\/g, "/");
          if (normalized.includes("/assets/")) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (normalized.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-cache");
          } else {
            res.setHeader("Cache-Control", "public, max-age=86400");
          }
        },
      })
    );
  }

  const repos = await createRepositories();
  const authHelpers = createAuthHelpers(repos);
  const writeAuditLog = createAuditWriter(repos);
  const refreshClinicsSnapshot = createClinicsSnapshotRefresher(repos);

  const routeDeps = {
    repos,
    ...authHelpers,
    writeAuditLog,
    refreshClinicsSnapshot,
  };

  if (!process.env.AWS_EXECUTION_ENV) {
    await refreshClinicsSnapshot();
  }

  registerClinicsRoutes(app, routeDeps);
  registerAdminRoutes(app, routeDeps);
  registerExperiencesRoutes(app, routeDeps);
  registerProjectsRoutes(app, routeDeps);
  registerExportRoutes(app, routeDeps);
  registerAuthRoutes(app, routeDeps);

  if (!process.env.AWS_EXECUTION_ENV) {
    app.get("*", (_req, res) => {
      res.sendFile(join(__dirname, "../dist/index.html"));
    });
  }

  if (process.env.SENTRY_DSN?.trim()) {
    const Sentry = await import("@sentry/node");
    Sentry.setupExpressErrorHandler(app);
  }

  return app;
}
