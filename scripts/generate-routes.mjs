import fs from "node:fs";
import path from "node:path";

const serverDir = path.join(import.meta.dirname, "..", "server");

function toRouterHandlers(body, apiPrefix) {
  const escaped = apiPrefix.replace(/\//g, "\\/");
  return body.replace(
    new RegExp(`app\\.(get|post|put|delete)\\("${escaped}`, "g"),
    'router.$1("'
  );
}

// Clinics
const clinicsRaw = fs.readFileSync(path.join(serverDir, "_extract_clinics.txt"), "utf8");
const jsonEnd = clinicsRaw.indexOf('app.get("/api/clinics');
const jsonBlock = clinicsRaw.slice(0, jsonEnd).trim();
const apiBlock = toRouterHandlers(clinicsRaw.slice(jsonEnd), "/api/clinics");

fs.writeFileSync(
  path.join(serverDir, "routes/clinics.js"),
  `import { Router } from "express";
import { randomUUID } from "crypto";
import { COOLDOWN_DAYS, MAX_ACTIVE_RESERVES } from "../lib/env.js";
import { canManageClinic } from "../lib/admin.js";
import { mapClinicRow } from "../lib/clinicMapper.js";
import { CLINICS_SNAPSHOT_PATH } from "../lib/clinicsSnapshot.js";

export function registerClinicsRoutes(app, deps) {
  const {
    repos,
    getUserIdFromToken,
    isAdminUser,
    writeAuditLog,
    refreshClinicsSnapshot,
  } = deps;

${jsonBlock}

  const router = Router();
${apiBlock}
  app.use("/api/clinics", router);
}
`
);

// Admin
let adminRaw = fs.readFileSync(path.join(serverDir, "_extract_admin.txt"), "utf8");
const adminConsts = adminRaw.split("app.get")[0].trim();
adminRaw = "app.get" + adminRaw.split("app.get").slice(1).join("app.get");
adminRaw = toRouterHandlers(adminRaw, "/api/admin");

fs.writeFileSync(
  path.join(serverDir, "routes/admin.js"),
  `import { Router } from "express";
import { randomUUID } from "crypto";
import { sendError } from "../lib/http.js";

${adminConsts}

export function registerAdminRoutes(app, deps) {
  const { repos, requireAdmin, writeAuditLog } = deps;
  const router = Router();
${adminRaw}
  app.use("/api/admin", router);
}
`
);

// Experiences
let expRaw = fs.readFileSync(path.join(serverDir, "_extract_experiences.txt"), "utf8");
const expConsts = expRaw.split("app.get")[0].trim();
expRaw = "app.get" + expRaw.split("app.get").slice(1).join("app.get");
expRaw = toRouterHandlers(expRaw, "/api/experiences");

fs.writeFileSync(
  path.join(serverDir, "routes/experiences.js"),
  `import { Router } from "express";
import { randomUUID } from "crypto";

${expConsts}

export function registerExperiencesRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
${expRaw}
  app.use("/api/experiences", router);
}
`
);

// Projects
let projRaw = fs.readFileSync(path.join(serverDir, "_extract_projects.txt"), "utf8");
const projConsts = projRaw.split("app.get")[0].trim();
projRaw = "app.get" + projRaw.split("app.get").slice(1).join("app.get");
projRaw = toRouterHandlers(projRaw, "/api/projects");

fs.writeFileSync(
  path.join(serverDir, "routes/projects.js"),
  `import { Router } from "express";
import { randomUUID } from "crypto";

${projConsts}

export { mapProjectRow, mapSessionRow };

export function registerProjectsRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
${projRaw}
  app.use("/api/projects", router);
}
`
);

// Export
let exportRaw = fs.readFileSync(path.join(serverDir, "_extract_export.txt"), "utf8");
exportRaw = exportRaw.replace(
  'app.get("/api/export/aadsas',
  'router.get("/aadsas'
);

fs.writeFileSync(
  path.join(serverDir, "routes/export.js"),
  `import { Router } from "express";
import { toAadsasRecords, toCsv } from "../export.js";
import { mapProjectRow, mapSessionRow } from "./projects.js";

export function registerExportRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
${exportRaw}
  app.use("/api/export", router);
}
`
);

console.log("Generated route files in server/routes/");
