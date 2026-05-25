import compression from "compression";
import express from "express";
import helmet from "helmet";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { toAadsasRecords, toCsv } from "./export.js";
import { writeClinicsSnapshotRows } from "./clinicsSnapshot.js";
import { publishClinicsSnapshotCdn } from "./publishClinicsSnapshotCdn.js";
import { createRepositories } from "./repositories/createRepositories.js";
import { verifyGoogleIdToken } from "./googleAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

/** HTTP API stage path prefix (e.g. /dev) — present when Lambda is behind API Gateway. */
const API_GATEWAY_STAGE = (process.env.API_GATEWAY_STAGE || "").trim();

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const COOLDOWN_DAYS = Math.min(21, Math.max(14, parseInt(process.env.COOLDOWN_DAYS, 10) || 14));
const MAX_ACTIVE_RESERVES = 3;
const VERIFICATION_TTL_MS = clamp(envInt("VERIFICATION_TTL_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const VERIFICATION_RESEND_COOLDOWN_MS = clamp(envInt("VERIFICATION_RESEND_COOLDOWN_MS", 60 * 1000), 10 * 1000, 10 * 60 * 1000);
const VERIFICATION_MAX_ATTEMPTS = clamp(envInt("VERIFICATION_MAX_ATTEMPTS", 5), 3, 10);
const VERIFICATION_LOCK_MS = clamp(envInt("VERIFICATION_LOCK_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const PASSWORD_RESET_TTL_MS = clamp(envInt("PASSWORD_RESET_TTL_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const PASSWORD_RESET_RESEND_COOLDOWN_MS = clamp(envInt("PASSWORD_RESET_RESEND_COOLDOWN_MS", 60 * 1000), 10 * 1000, 10 * 60 * 1000);
const PASSWORD_RESET_MAX_ATTEMPTS = clamp(envInt("PASSWORD_RESET_MAX_ATTEMPTS", 5), 3, 10);
const PASSWORD_RESET_LOCK_MS = clamp(envInt("PASSWORD_RESET_LOCK_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const SESSION_TTL_MS = clamp(envInt("SESSION_TTL_MS", 7 * 24 * 60 * 60 * 1000), 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000);
const SESSION_REFRESH_THRESHOLD_MS = clamp(
  envInt("SESSION_REFRESH_THRESHOLD_MS", 24 * 60 * 60 * 1000),
  5 * 60 * 1000,
  SESSION_TTL_MS
);
/** Production uses __Host- prefix (requires Secure + Path=/, no Domain). Dev stays plain name over HTTP. */
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-shadowing_session"
    : "shadowing_session";
const LOGIN_RATE_WINDOW_MS = clamp(envInt("LOGIN_RATE_WINDOW_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const LOGIN_MAX_ATTEMPTS_PER_IP = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_IP", 10), 3, 100);
const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 10), 3, 100);
const AUTH_LOGGING_ENABLED = process.env.AUTH_LOGGING_ENABLED !== "false";
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function loginRateLimitKey(kind, value) {
  return `login:${kind}:${value}`;
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "unknown";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "unknown";
  const safeLocal = localPart.length <= 2
    ? `${localPart[0] || "*"}*`
    : `${localPart.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}

function logAuthEvent(event, details = {}) {
  if (!AUTH_LOGGING_ENABLED) return;
  const payload = { event, at: new Date().toISOString(), ...details };
  console.info("[auth]", JSON.stringify(payload));
}

function authRequestMeta(req, details = {}) {
  return {
    requestId: req.requestId || "unknown",
    ip: req.ip || "unknown",
    ...details,
  };
}

function logAuthEventForRequest(req, event, details = {}) {
  logAuthEvent(event, authRequestMeta(req, details));
}

async function sendAuthEmail({ to, subject, html, purpose }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "Shadow Network <noreply@shadowingnetwork.com>";
  if (!apiKey) {
    const reason = "missing_resend_api_key";
    logAuthEvent(`${purpose}_email_skipped`, { email: maskEmail(to), reason });
    return process.env.NODE_ENV === "production" && process.env.CI !== "true"
      ? { sent: false, reason }
      : { sent: true, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      logAuthEvent(`${purpose}_email_failed`, {
        email: maskEmail(to),
        providerStatus: response.status,
        providerBody: body.slice(0, 300),
      });
      return { sent: false, reason: "provider_error", providerStatus: response.status };
    }

    let providerId = null;
    try {
      providerId = JSON.parse(body)?.id ?? null;
    } catch {
      providerId = null;
    }
    logAuthEvent(`${purpose}_email_sent`, { email: maskEmail(to), providerId });
  } catch (error) {
    logAuthEvent(`${purpose}_email_failed`, {
      email: maskEmail(to),
      reason: "provider_exception",
      message: error?.message || "unknown",
    });
    return { sent: false, reason: "provider_exception" };
  }

  return { sent: true };
}

function sendError(req, res, status, error, extra = {}) {
  res.status(status).json({
    error,
    requestId: req.requestId || "unknown",
    ...extra,
  });
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

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
              "https://accounts.google.com",
              "https://oauth2.googleapis.com",
            ],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            frameSrc: ["https://accounts.google.com"],
            scriptSrc: ["'self'", "https://accounts.google.com"],
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
app.use((req, res, next) => {
  const inboundId = req.headers["x-request-id"];
  const requestId = typeof inboundId === "string" && inboundId.trim()
    ? inboundId.trim()
    : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

if (process.env.AWS_EXECUTION_ENV && API_GATEWAY_STAGE && API_GATEWAY_STAGE !== "$default") {
  app.use((req, _res, next) => {
    const prefix = `/${API_GATEWAY_STAGE}`;
    const raw = req.originalUrl || req.url || "/";
    const qIdx = raw.indexOf("?");
    const pathOnly = qIdx === -1 ? raw : raw.slice(0, qIdx);
    const qs = qIdx === -1 ? "" : raw.slice(qIdx);
    if (pathOnly !== prefix && !pathOnly.startsWith(`${prefix}/`)) {
      next();
      return;
    }
    const rest = pathOnly === prefix ? "/" : pathOnly.slice(prefix.length);
    req.url = rest + qs;
    req.originalUrl = req.url;
    next();
  });
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

// --- Auth helpers ---

const isValidEduEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const norm = email.trim().toLowerCase();
  if (!norm.includes("@")) return false;
  const domain = norm.split("@")[1];
  return typeof domain === "string" && domain.endsWith(".edu");
};

// Alias kept for internal call sites
const isValidUWEmail = isValidEduEmail;

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuf, derived);
};

const isAdminUser = (userId) => {
  return !!userId && ADMIN_EMAILS.has(String(userId).trim().toLowerCase());
};

const canManageClinic = (row, userId) => {
  if (!userId) return false;
  return isAdminUser(userId) || row.created_by_user_id === userId;
};

async function requireAdmin(req, res) {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    sendError(req, res, 401, "Unauthorized");
    return null;
  }
  if (!isAdminUser(userId)) {
    sendError(req, res, 403, "Admin access required.");
    return null;
  }
  return userId;
}

async function writeAuditLog(actorUserId, action, targetType = null, targetId = null, details = null) {
  if (!actorUserId) return;
  try {
    await repos.auditLogs.insert({
      id: randomUUID(),
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details == null ? null : JSON.stringify(details),
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("[audit]", error);
  }
}

const mapClinicRow = (row, viewerUserId = null) => {
  let secondaryFilters = [];
  try {
    secondaryFilters = row.secondary_filters ? JSON.parse(row.secondary_filters) : [];
  } catch {
    secondaryFilters = [];
  }
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email ?? null,
    lat: row.lat,
    lng: row.lng,
    zip: row.zip,
    shadowingStatus: row.shadowing_status,
    primarySpecialty: row.primary_specialty ?? "gp",
    secondaryFilters,
    notes: row.notes,
    lastVerifiedAt: row.last_verified_at,
    lockExpiresAt: row.lock_expires_at ?? null,
    lockedByRequestId: row.locked_by_request_id ?? null,
    ownedByCurrentUser: !!viewerUserId && row.created_by_user_id === viewerUserId,
    canManage: canManageClinic(row, viewerUserId)
  };
};


const CLINICS_SNAPSHOT_PATH = process.env.AWS_EXECUTION_ENV
  ? join("/tmp", "clinics.json")
  : join(__dirname, "generated", "clinics.json");

async function refreshClinicsSnapshot() {
  try {
    const rows = await repos.clinics.selectAllOrdered();
    await writeClinicsSnapshotRows(rows, CLINICS_SNAPSHOT_PATH);
    await publishClinicsSnapshotCdn(CLINICS_SNAPSHOT_PATH);
  } catch (error) {
    console.error("[clinics snapshot]", error);
  }
}

if (!process.env.AWS_EXECUTION_ENV) {
  await refreshClinicsSnapshot();
}

function parseCookies(req) {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return {};

  return rawCookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return acc;
      const key = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  const primary = cookies[SESSION_COOKIE_NAME];
  if (primary) return primary;
  // One release: accept legacy cookie name, then rotate to __Host- on refresh/login.
  if (process.env.NODE_ENV === "production" && cookies.shadowing_session) {
    return cookies.shadowing_session;
  }
  return null;
}

function setSessionCookie(res, token) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`
  );
  if (process.env.NODE_ENV === "production" && SESSION_COOKIE_NAME !== "shadowing_session") {
    res.appendHeader(
      "Set-Cookie",
      `shadowing_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
    );
  }
}

function clearSessionCookie(res) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
  );
  if (process.env.NODE_ENV === "production" && SESSION_COOKIE_NAME !== "shadowing_session") {
    res.appendHeader(
      "Set-Cookie",
      `shadowing_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
    );
  }
}

async function issueSession(userId, res) {
  const token = randomBytes(32).toString("hex");
  await repos.authSessions.insert(token, userId, new Date().toISOString());
  setSessionCookie(res, token);
  return token;
}

async function getUserIdFromToken(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  const row = await repos.authSessions.findByToken(token);
  if (!row) return null;

  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > SESSION_TTL_MS) {
    await repos.authSessions.deleteByToken(token);
    return null;
  }

  // Sliding session: refresh active sessions at most once per threshold window.
  if (age > SESSION_REFRESH_THRESHOLD_MS && req.res) {
    await repos.authSessions.updateCreatedAt(token, new Date().toISOString());
    setSessionCookie(req.res, token);
  }

  return row.user_id;
}

app.get("/clinics.json", (req, res, next) => {
  res.type("application/json");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.sendFile(CLINICS_SNAPSHOT_PATH, (err) => {
    if (err) next(err);
  });
});

app.get("/api/clinics/locks", async (req, res) => {
  const rows = await repos.clinics.selectLockColumns();
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Cache-Control", "public, max-age=15");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.json(
    rows.map((row) => ({
      id: row.id,
      lockExpiresAt: row.lock_expires_at ?? null,
      lockedByRequestId: row.locked_by_request_id ?? null
    }))
  );
});

app.get("/api/clinics/session-overlay", async (req, res) => {
  const viewerUserId = await getUserIdFromToken(req);
  res.setHeader("Cache-Control", "private, no-store");
  if (!viewerUserId) {
    res.json({ clinics: [] });
    return;
  }
  const rows = await repos.clinics.selectIdAndCreatedBy();
  res.json({
    clinics: rows.map((row) => ({
      id: row.id,
      ownedByCurrentUser: row.created_by_user_id === viewerUserId,
      canManage: canManageClinic(row, viewerUserId)
    }))
  });
});

app.get("/api/clinics", async (req, res) => {
  const viewerUserId = await getUserIdFromToken(req);
  const rows = await repos.clinics.selectAllOrdered();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map((row) => mapClinicRow(row, viewerUserId)));
});

app.post("/api/clinics", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    address,
    phone,
    email,
    lat,
    lng,
    zip,
    shadowingStatus,
    primarySpecialty,
    secondaryFilters,
    notes
  } = req.body ?? {};

  if (!name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const id = randomUUID();
  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  const secondaryFiltersJson = Array.isArray(secondaryFilters)
    ? JSON.stringify(secondaryFilters)
    : "[]";
  await repos.clinics.insert({
    id,
    name,
    address,
    phone: phone ?? "",
    email: email ?? "",
    lat,
    lng,
    zip: zip ?? "",
    shadowing_status: shadowingStatus ?? "mixed",
    primary_specialty: primarySpecialty ?? "gp",
    secondary_filters: secondaryFiltersJson,
    notes: notes ?? "",
    last_verified_at: lastVerifiedAt,
    created_by_user_id: requesterId,
    lock_expires_at: null,
    locked_by_request_id: null
  });

  await writeAuditLog(requesterId, "clinic.create", "clinic", id, { name });
  void refreshClinicsSnapshot();
  res.status(201).json({ id });
});

app.put("/api/clinics/:id", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const {
    name,
    address,
    phone,
    email,
    lat,
    lng,
    zip,
    shadowingStatus,
    primarySpecialty,
    secondaryFilters,
    notes
  } = req.body ?? {};

  if (!id || !name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const clinic = await repos.clinics.findById(id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }
  if (!canManageClinic(clinic, requesterId)) {
    res.status(403).json({ error: "You can only edit clinics you added." });
    return;
  }

  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  const secondaryFiltersJson = Array.isArray(secondaryFilters)
    ? JSON.stringify(secondaryFilters)
    : "[]";
  await repos.clinics.updateFull({
    ...clinic,
    name,
    address,
    phone: phone ?? "",
    email: email ?? "",
    lat,
    lng,
    zip: zip ?? "",
    shadowing_status: shadowingStatus ?? "mixed",
    primary_specialty: primarySpecialty ?? "gp",
    secondary_filters: secondaryFiltersJson,
    notes: notes ?? "",
    last_verified_at: lastVerifiedAt
  });

  await writeAuditLog(requesterId, "clinic.update", "clinic", id, { name });
  void refreshClinicsSnapshot();
  res.json({ ok: true });
});

app.delete("/api/clinics/:id", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const clinic = await repos.clinics.findById(id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }
  if (!canManageClinic(clinic, requesterId)) {
    res.status(403).json({ error: "You can only delete clinics you added." });
    return;
  }

  await repos.clinics.deleteById(id);
  await writeAuditLog(requesterId, "clinic.delete", "clinic", id, { name: clinic.name });
  void refreshClinicsSnapshot();
  res.json({ ok: true });
});

// Delete all clinics (and their shadowing_requests). Use with care.
app.delete("/api/clinics", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isAdminUser(requesterId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  const result = await repos.clinics.deleteAll();
  await writeAuditLog(requesterId, "clinic.delete_all", "clinic", null, { deleted: result.changes });
  void refreshClinicsSnapshot();
  res.json({ ok: true, deleted: result.changes });
});

// --- Shadowing request (first-come lock + cooldown) ---

app.post("/api/clinics/:id/request", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id: clinicId } = req.params;
  if (!clinicId) {
    res.status(400).json({ error: "Clinic ID required." });
    return;
  }

  const clinic = await repos.clinics.findById(clinicId);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }

  const reservableStatuses = new Set(["available", "mixed"]);
  if (!reservableStatuses.has(clinic.shadowing_status)) {
    res.status(400).json({
      error: "This clinic is not available for shadowing requests."
    });
    return;
  }

  const now = new Date().toISOString();
  const activeReserveCount = await repos.shadowingRequests.countActiveForUser(userId, now);
  if (activeReserveCount >= MAX_ACTIVE_RESERVES) {
    res.status(429).json({
      error: `You already have ${MAX_ACTIVE_RESERVES} active reserves. Please wait until one expires before reserving another clinic.`,
      activeReserveCount,
      maxActiveReserves: MAX_ACTIVE_RESERVES
    });
    return;
  }

  const lockExpiresAt = clinic.lock_expires_at;
  if (lockExpiresAt && lockExpiresAt > now) {
    const untilDate = new Date(lockExpiresAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    res.status(409).json({
      error: `This clinic is temporarily unavailable until ${untilDate}.`,
      lockExpiresAt
    });
    return;
  }

  const requestId = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COOLDOWN_DAYS);
  const expiresAtIso = expiresAt.toISOString();

  const lockAcquired = await repos.clinics.tryAcquireLock(clinicId, expiresAtIso, requestId, now);
  if (!lockAcquired) {
    res.status(409).json({
      error: "This clinic was just reserved by someone else. Please try again shortly.",
      lockExpiresAt: clinic.lock_expires_at ?? null
    });
    return;
  }

  try {
    await repos.shadowingRequests.insert({
      id: requestId,
      clinic_id: clinicId,
      user_id: userId,
      lock_expires_at: expiresAtIso,
      reserve_units: 1,
      created_at: now
    });
  } catch (err) {
    await repos.clinics.clearLockByRequestId(requestId);
    throw err;
  }

  const updated = await repos.clinics.findById(clinicId);
  res.status(201).json({
    requestId,
    lockExpiresAt: expiresAtIso,
    clinic: mapClinicRow(updated)
  });
});

// --- Admin tools ---

const parseDetails = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapAuditLogRow = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  details: parseDetails(row.details),
  createdAt: row.created_at,
});

const mapQualityFlagRow = (row) => ({
  id: row.id,
  clinicId: row.clinic_id,
  clinicName: row.clinic_name ?? null,
  flagType: row.flag_type,
  notes: row.notes ?? "",
  status: row.status,
  createdByUserId: row.created_by_user_id,
  resolvedByUserId: row.resolved_by_user_id,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

app.get("/api/admin/audit-logs", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.auditLogs.listRecent100();
  res.json(rows.map(mapAuditLogRow));
});

app.get("/api/admin/reserves", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.clinics.selectActiveReservesJoin(new Date().toISOString());

  res.json(rows.map((row) => ({
    requestId: row.locked_by_request_id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    shadowingStatus: row.shadowing_status,
    userId: row.user_id || null,
    createdAt: row.created_at || null,
    lockExpiresAt: row.lock_expires_at,
    reserveUnits: row.reserve_units ?? 1,
    isLegacy: !row.user_id,
  })));
});

app.delete("/api/admin/reserves/:requestId", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { requestId } = req.params;
  const clinic = await repos.clinics.findIdNameByLockedRequest(requestId);
  if (!clinic) {
    sendError(req, res, 404, "Reserve not found.");
    return;
  }

  const now = new Date().toISOString();
  await repos.shadowingRequests.setLockExpired(requestId, now);
  await repos.clinics.clearLockByRequestId(requestId);
  await writeAuditLog(adminId, "reserve.unreserve", "shadowing_request", requestId, {
    clinicId: clinic.id,
    clinicName: clinic.name,
  });

  res.json({ ok: true });
});

app.get("/api/admin/quality-flags", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.qualityFlags.listWithClinicNames();
  res.json(rows.map(mapQualityFlagRow));
});

app.post("/api/admin/quality-flags", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { clinicId, clinic_id: clinicIdLegacy, flagType, flag_type: flagTypeLegacy, notes } = req.body ?? {};
  const targetClinicId = clinicId || clinicIdLegacy;
  const targetFlagType = flagType || flagTypeLegacy;
  if (!targetClinicId || !targetFlagType) {
    sendError(req, res, 400, "Clinic and flag type are required.");
    return;
  }

  const clinic = await repos.qualityFlags.clinicIdName(targetClinicId);
  if (!clinic) {
    sendError(req, res, 404, "Clinic not found.");
    return;
  }

  const id = randomUUID();
  await repos.qualityFlags.insert({
    id,
    clinic_id: targetClinicId,
    flag_type: targetFlagType,
    notes: notes ?? "",
    created_by_user_id: adminId
  });
  await writeAuditLog(adminId, "quality_flag.create", "clinic_quality_flag", id, {
    clinicId: targetClinicId,
    clinicName: clinic.name,
    flagType: targetFlagType,
  });
  res.status(201).json({ id });
});

app.put("/api/admin/quality-flags/:id/resolve", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const result = await repos.qualityFlags.resolve(id, adminId, new Date().toISOString());
  if (!result.changes) {
    sendError(req, res, 404, "Flag not found.");
    return;
  }
  await writeAuditLog(adminId, "quality_flag.resolve", "clinic_quality_flag", id);
  res.json({ ok: true });
});

app.delete("/api/admin/quality-flags/:id", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const result = await repos.qualityFlags.deleteById(id);
  if (!result.changes) {
    sendError(req, res, 404, "Flag not found.");
    return;
  }
  await writeAuditLog(adminId, "quality_flag.delete", "clinic_quality_flag", id);
  res.json({ ok: true });
});

app.post("/api/admin/cleanup/expired-reserves", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const now = new Date().toISOString();
  const clinicsResult = await repos.shadowingRequests.unlockClinicsExpired(now);
  const requestsResult = await repos.shadowingRequests.deleteExpired(now);
  const result = {
    unlockedClinics: clinicsResult.changes ?? 0,
    deletedRequests: requestsResult.changes ?? 0,
  };
  await writeAuditLog(adminId, "cleanup.expired_reserves", "cleanup", null, result);
  res.json({ ok: true, ...result });
});

app.get("/api/admin/cleanup/duplicates", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.duplicateClinicNames();
  res.json(rows.map((row) => ({
    normalizedName: row.normalized_name,
    count: row.count,
    clinicIds: row.clinic_ids ? row.clinic_ids.split("|") : [],
    clinicNames: row.clinic_names ? row.clinic_names.split("|") : [],
  })));
});

app.get("/api/admin/cleanup/missing-contact", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.missingContactClinics();
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    shadowingStatus: row.shadowing_status,
  })));
});

app.get("/api/admin/cleanup/stale-clinics", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.staleClinics();
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastVerifiedAt: row.last_verified_at,
    shadowingStatus: row.shadowing_status,
  })));
});

// --- Experiences (Dental Shadowing Tracker) ---

const mapExperienceRow = (row) => ({
  id: row.id,
  experienceType: row.experience_type,
  organizationName: row.organization_name,
  address: row.address,
  address2: row.address2,
  city: row.city,
  stateProvince: row.state_province,
  country: row.country,
  zip: row.zip,
  supervisorFirstName: row.supervisor_first_name,
  supervisorLastName: row.supervisor_last_name,
  supervisorTitle: row.supervisor_title,
  supervisorPhone: row.supervisor_phone,
  supervisorEmail: row.supervisor_email,
  hours: row.hours,
  dateStart: row.date_start,
  dateEnd: row.date_end,
  notes: row.notes,
  description: row.description,
  avgWeeklyHours: row.avg_weekly_hours,
  numberOfWeeks: row.number_of_weeks,
  currentExperience: !!row.current_experience,
  status: row.status,
  title: row.title,
  typeCompensated: !!row.type_compensated,
  typeAcademicCredit: !!row.type_academic_credit,
  typeVolunteer: !!row.type_volunteer,
  createdAt: row.created_at,
});

app.get("/api/experiences", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { clinic, supervisor, phone, email, type } = req.query;
  const rows = await repos.experiences.listFiltered(userId, {
    clinic,
    supervisor,
    phone,
    email,
    type
  });
  res.json(rows.map(mapExperienceRow));
});

app.post("/api/experiences", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body ?? {};
  const {
    experienceType,
    organizationName,
    address,
    address2,
    city,
    stateProvince,
    country,
    zip,
    supervisorFirstName,
    supervisorLastName,
    supervisorTitle,
    supervisorPhone,
    supervisorEmail,
    hours,
    dateStart,
    dateEnd,
    notes,
    description,
    avgWeeklyHours,
    numberOfWeeks,
    currentExperience,
    status,
    title,
    typeCompensated,
    typeAcademicCredit,
    typeVolunteer,
  } = body;

  const hoursNum = Number(hours);
  if (!organizationName || Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "Organization name and valid hours are required." });
    return;
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();
  await repos.experiences.insert({
    id,
    user_id: userId,
    experience_type: experienceType ?? "dental_shadowing_in_person",
    organization_name: organizationName,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    hours: hoursNum,
    date_start: dateStart ?? "",
    date_end: dateEnd ?? "",
    notes: notes ?? "",
    description: description ?? "",
    avg_weekly_hours: avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
    number_of_weeks: numberOfWeeks != null ? Number(numberOfWeeks) : null,
    current_experience: currentExperience ? 1 : 0,
    status: status ?? "",
    title: title ?? "",
    type_compensated: typeCompensated ? 1 : 0,
    type_academic_credit: typeAcademicCredit ? 1 : 0,
    type_volunteer: typeVolunteer ? 1 : 0,
    created_at
  });

  res.status(201).json({ id });
});

app.put("/api/experiences/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const body = req.body ?? {};
  const {
    experienceType,
    organizationName,
    address,
    address2,
    city,
    stateProvince,
    country,
    zip,
    supervisorFirstName,
    supervisorLastName,
    supervisorTitle,
    supervisorPhone,
    supervisorEmail,
    hours,
    dateStart,
    dateEnd,
    notes,
    description,
    avgWeeklyHours,
    numberOfWeeks,
    currentExperience,
    status,
    title,
    typeCompensated,
    typeAcademicCredit,
    typeVolunteer,
  } = body;

  const hoursNum = Number(hours);
  if (!id || !organizationName || Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "ID, organization name and valid hours are required." });
    return;
  }

  const result = await repos.experiences.update({
    id,
    user_id: userId,
    experience_type: experienceType ?? "dental_shadowing_in_person",
    organization_name: organizationName,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    hours: hoursNum,
    date_start: dateStart ?? "",
    date_end: dateEnd ?? "",
    notes: notes ?? "",
    description: description ?? "",
    avg_weekly_hours: avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
    number_of_weeks: numberOfWeeks != null ? Number(numberOfWeeks) : null,
    current_experience: currentExperience ? 1 : 0,
    status: status ?? "",
    title: title ?? "",
    type_compensated: typeCompensated ? 1 : 0,
    type_academic_credit: typeAcademicCredit ? 1 : 0,
    type_volunteer: typeVolunteer ? 1 : 0
  });

  if (!result.changes) {
    res.status(404).json({ error: "Experience not found or not owned by this user." });
    return;
  }

  res.json({ ok: true });
});

app.delete("/api/experiences/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "ID required." });
    return;
  }
  const result = await repos.experiences.delete(id, userId);
  if (!result.changes) {
    res.status(404).json({ error: "Experience not found or not owned by this user." });
    return;
  }
  res.json({ ok: true });
});

// --- Projects + Sessions ---

const mapProjectRow = (row) => ({
  id: row.id,
  name: row.name,
  clinicId: row.clinic_id ?? null,
  experienceType: row.experience_type ?? null,
  address: row.address ?? null,
  address2: row.address2 ?? null,
  city: row.city ?? null,
  stateProvince: row.state_province ?? null,
  country: row.country ?? null,
  zip: row.zip ?? null,
  supervisorFirstName: row.supervisor_first_name ?? null,
  supervisorLastName: row.supervisor_last_name ?? null,
  supervisorTitle: row.supervisor_title ?? null,
  supervisorPhone: row.supervisor_phone ?? null,
  supervisorEmail: row.supervisor_email ?? null,
  status: row.status ?? null,
  description: row.description ?? null,
  notes: row.notes ?? null,
  dateStart: row.date_start ?? null,
  createdAt: row.created_at,
});

const mapSessionRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  date: row.date ?? null,
  hours: row.hours,
  notes: row.notes ?? null,
  createdAt: row.created_at,
});

app.get("/api/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await repos.projects.listByUser(userId);
  const result = await Promise.all(
    rows.map(async (p) => {
      const sessions = await repos.projects.sessionsByProject(p.id);
      return { ...mapProjectRow(p), sessions: sessions.map(mapSessionRow) };
    })
  );
  res.json(result);
});

app.post("/api/projects", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    dateStart,
    clinicId,
    experienceType,
    address, address2, city, stateProvince, country, zip,
    supervisorFirstName, supervisorLastName, supervisorTitle,
    supervisorPhone, supervisorEmail,
    status, description, notes,
  } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: "Project name is required." });
    return;
  }
  if (!dateStart) {
    res.status(400).json({ error: "Project start date is required." });
    return;
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();
  await repos.projects.insert({
    id,
    user_id: userId,
    name,
    date_start: dateStart,
    clinic_id: clinicId ?? null,
    experience_type: experienceType ?? null,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    status: status ?? "",
    description: description ?? "",
    notes: notes ?? "",
    created_at
  });

  res.status(201).json({ id });
});

app.put("/api/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const project = await repos.projects.findOwnedId(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const {
    name,
    dateStart,
    clinicId,
    experienceType,
    address, address2, city, stateProvince, country, zip,
    supervisorFirstName, supervisorLastName, supervisorTitle,
    supervisorPhone, supervisorEmail,
    status, description, notes,
  } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: "Project name is required." });
    return;
  }
  if (!dateStart) {
    res.status(400).json({ error: "Project start date is required." });
    return;
  }

  const full = await repos.projects.findOwnedFull(id, userId);
  await repos.projects.update({
    ...full,
    name,
    date_start: dateStart,
    clinic_id: clinicId ?? null,
    experience_type: experienceType ?? null,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    status: status ?? "",
    description: description ?? "",
    notes: notes ?? ""
  });

  res.json({ ok: true });
});

app.post("/api/projects/:id/sessions", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id: projectId } = req.params;

  const project = await repos.projects.findOwnedId(projectId, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const { date, hours, notes } = req.body ?? {};
  const hoursNum = Number(hours);
  if (Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "Valid hours are required." });
    return;
  }

  const id = randomUUID();
  await repos.placementSessions.insert({
    id,
    project_id: projectId,
    date: date ?? null,
    hours: hoursNum,
    notes: notes ?? "",
    created_at: new Date().toISOString()
  });

  res.status(201).json({ id });
});

app.get("/api/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  const project = await repos.projects.findOwnedFull(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const sessions = await repos.projects.sessionsByProject(id);

  res.json({ ...mapProjectRow(project), sessions: sessions.map(mapSessionRow) });
});

app.delete("/api/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const project = await repos.projects.findOwnedId(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await repos.projects.deleteCascade(id);
  res.json({ ok: true });
});

app.delete("/api/projects/:id/sessions/:sessionId", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id: projectId, sessionId } = req.params;
  const project = await repos.projects.findOwnedId(projectId, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await repos.placementSessions.delete(projectId, sessionId);
  res.json({ ok: true });
});

// --- Auth endpoints ---

app.get("/api/auth/config", (_req, res) => {
  const googleClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  res.json({ googleClientId: googleClientId || null });
});

app.post("/api/auth/google", async (req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    sendError(req, res, 503, "Google sign-in is not configured.");
    return;
  }

  const { credential } = req.body ?? {};
  if (!credential || typeof credential !== "string") {
    sendError(req, res, 400, "Google credential is required.");
    return;
  }

  const profile = await verifyGoogleIdToken(credential, clientId);
  if (!profile) {
    logAuthEventForRequest(req, "google_token_invalid", {});
    sendError(req, res, 401, "Google sign-in failed. Please try again.");
    return;
  }

  const { email, sub } = profile;
  if (!isValidEduEmail(email)) {
    logAuthEventForRequest(req, "google_edu_rejected", { email: maskEmail(email) });
    sendError(req, res, 403, "Only university .edu email addresses are allowed.");
    return;
  }

  const existingBySub = await repos.users.findByGoogleSub(sub);
  if (existingBySub && existingBySub.email !== email) {
    logAuthEventForRequest(req, "google_sub_conflict", { email: maskEmail(email) });
    sendError(req, res, 409, "This Google account is linked to another user.");
    return;
  }

  const user = await repos.users.findForLogin(email);
  if (!user) {
    await repos.users.insertGoogle(email, sub);
    logAuthEventForRequest(req, "google_register", { email: maskEmail(email) });
  } else {
    if (user.google_sub && user.google_sub !== sub) {
      logAuthEventForRequest(req, "google_email_conflict", { email: maskEmail(email) });
      sendError(req, res, 409, "This email is linked to a different Google account.");
      return;
    }
    if (!user.google_sub) {
      await repos.users.linkGoogle(email, sub);
    } else if (!Number(user.is_verified)) {
      await repos.users.verifySuccess(email);
    }
    logAuthEventForRequest(req, "google_login", { email: maskEmail(email) });
  }

  await issueSession(email, res);
  res.json({ email, isAdmin: isAdminUser(email) });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    sendError(req, res, 400, "Email and password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    sendError(req, res, 400, "Password must be at least 8 characters.");
    return;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    sendError(req, res, 400, "Password must include both letters and numbers.");
    return;
  }
  if (password.length > 128) {
    sendError(req, res, 400, "Password is too long.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await repos.users.existsEmail(normalizedEmail);
  if (existing) {
    logAuthEventForRequest(req, "register_conflict", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 409, "An account with this email already exists.");
    return;
  }

  const passwordHash = hashPassword(password);
  await repos.users.insert(normalizedEmail, passwordHash);

  const sendResult = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: false });
  if (!sendResult.sent) {
    logAuthEventForRequest(req, "register_verification_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: sendResult.reason || "unknown",
    });
    sendError(
      req,
      res,
      502,
      "Account was created but we could not send a verification email. Use “Resend code” to try again."
    );
    return;
  }

  logAuthEventForRequest(req, "register_success", { email: maskEmail(normalizedEmail) });

  res.status(201).json({ email: normalizedEmail, verificationSent: true });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    sendError(req, res, 400, "Email and password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }

  const now = Date.now();
  const ipKey = loginRateLimitKey("ip", req.ip || "unknown");
  const normalizedEmail = email.trim().toLowerCase();
  const accountKey = loginRateLimitKey("account", normalizedEmail);

  if (
    (await repos.rateLimits.isRateLimited(
      ipKey,
      LOGIN_MAX_ATTEMPTS_PER_IP,
      LOGIN_RATE_WINDOW_MS,
      now
    )) ||
    (await repos.rateLimits.isRateLimited(
      accountKey,
      LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
      LOGIN_RATE_WINDOW_MS,
      now
    ))
  ) {
    logAuthEventForRequest(req, "login_rate_limited", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many login attempts. Try again in 10 minutes.");
    return;
  }

  const user = await repos.users.findForLogin(normalizedEmail);

  if (!user) {
    await repos.rateLimits.recordFailedAttempt(ipKey, LOGIN_RATE_WINDOW_MS, now);
    await repos.rateLimits.recordFailedAttempt(accountKey, LOGIN_RATE_WINDOW_MS, now);
    logAuthEventForRequest(req, "login_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 401, "Invalid email or password.");
    return;
  }

  const passwordHash = user.password_hash;
  const usesGoogleOnly =
    user.google_sub && (!passwordHash || String(passwordHash).trim() === "");
  if (usesGoogleOnly) {
    logAuthEventForRequest(req, "login_google_required", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 401, "This account uses Google sign-in.");
    return;
  }

  if (!verifyPassword(password, passwordHash)) {
    await repos.rateLimits.recordFailedAttempt(ipKey, LOGIN_RATE_WINDOW_MS, now);
    await repos.rateLimits.recordFailedAttempt(accountKey, LOGIN_RATE_WINDOW_MS, now);
    logAuthEventForRequest(req, "login_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 401, "Invalid email or password.");
    return;
  }

  await repos.rateLimits.clear(accountKey);

  if (!Number(user?.is_verified)) {
    const sendResult = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
    if (!sendResult.sent && sendResult.reason !== "resend_cooldown") {
      logAuthEventForRequest(req, "login_verification_send_failed", {
        email: maskEmail(normalizedEmail),
        reason: sendResult.reason || "unknown",
      });
      sendError(req, res, 502, "Could not send verification email. Please try again shortly.");
      return;
    }
    logAuthEventForRequest(req, "login_unverified", {
      email: maskEmail(normalizedEmail),
      verificationSent: sendResult.sent,
      verificationReason: sendResult.reason || null,
    });
    sendError(req, res, 403, "email_not_verified", { email: normalizedEmail });
    return;
  }

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "login_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});

app.delete("/api/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    await repos.authSessions.deleteByToken(token);
  }
  clearSessionCookie(res);
  logAuthEventForRequest(req, "logout", { hadSession: !!token });
  res.json({ ok: true });
});

app.get("/api/auth/session", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    clearSessionCookie(res);
    res.status(401).json({ authenticated: false, requestId: req.requestId || "unknown" });
    return;
  }
  res.json({ authenticated: true, email: userId, isAdmin: isAdminUser(userId) });
});

// --- Email verification ---

async function sendVerificationCode(email, options = {}) {
  const { enforceResendCooldown = false } = options;
  const existing = await repos.users.findVerificationSentAt(email);

  if (!existing) {
    return { sent: false, reason: "user_not_found" };
  }

  if (enforceResendCooldown && existing.verification_sent_at) {
    const elapsed = Date.now() - new Date(existing.verification_sent_at).getTime();
    if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
      const retryAfterMs = Math.max(0, VERIFICATION_RESEND_COOLDOWN_MS - elapsed);
      return { sent: false, reason: "resend_cooldown", retryAfterMs };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  await repos.users.updateVerificationSend(email, code, expiresAt, nowIso);

  const delivery = await sendAuthEmail({
    to: email,
    subject: "Your Shadow Network verification code",
    purpose: "verification",
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Enter this code to complete sign-in:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;padding:1rem;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#888;font-size:0.875rem">Expires in 10 minutes. If you did not request this, ignore this email.</p>
        </div>
      `,
  });

  if (!delivery.sent) return delivery;

  return { sent: true };
}

async function sendPasswordResetCode(email, options = {}) {
  const { enforceResendCooldown = false } = options;
  const existing = await repos.users.findPasswordResetSentAt(email);

  if (!existing) {
    return { sent: false, reason: "user_not_found" };
  }

  if (enforceResendCooldown && existing.password_reset_sent_at) {
    const elapsed = Date.now() - new Date(existing.password_reset_sent_at).getTime();
    if (elapsed < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
      const retryAfterMs = Math.max(0, PASSWORD_RESET_RESEND_COOLDOWN_MS - elapsed);
      return { sent: false, reason: "resend_cooldown", retryAfterMs };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  await repos.users.updatePasswordResetSend(email, code, expiresAt, nowIso);

  const delivery = await sendAuthEmail({
    to: email,
    subject: "Shadow Network password reset code",
    purpose: "password_reset",
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Reset your password</h2>
          <p>Use this code to reset your Shadow Network password:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;padding:1rem;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#888;font-size:0.875rem">This code expires in 10 minutes. If you did not request a password reset, you can safely ignore this email.</p>
        </div>
      `,
  });

  if (!delivery.sent) return delivery;

  return { sent: true };
}

app.post("/api/auth/send-verification", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email is required.");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.existsEmail(normalizedEmail);

  // Always return a generic success envelope to avoid account enumeration.
  if (!user) {
    logAuthEventForRequest(req, "verification_send_unknown_account", { email: maskEmail(normalizedEmail) });
    res.json({ ok: true });
    return;
  }

  const result = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
  if (!result.sent && result.reason === "resend_cooldown") {
    logAuthEventForRequest(req, "verification_send_cooldown", { email: maskEmail(normalizedEmail) });
    sendError(
      req,
      res,
      429,
      "Please wait before requesting another verification code.",
      { retryAfterSeconds: Math.ceil((result.retryAfterMs ?? 0) / 1000) }
    );
    return;
  }
  if (!result.sent) {
    logAuthEventForRequest(req, "verification_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: result.reason || "unknown",
    });
    sendError(req, res, 502, "Could not send verification email. Please try again shortly.");
    return;
  }

  logAuthEventForRequest(req, "verification_send", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

app.post("/api/auth/verify", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    sendError(req, res, 400, "Email and code are required.");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findVerificationState(normalizedEmail);

  if (user?.verification_locked_until && new Date(user.verification_locked_until) > new Date()) {
    logAuthEventForRequest(req, "verification_locked", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many failed attempts. Please try again later.");
    return;
  }

  if (!user || user.verification_code !== String(code).trim()) {
    if (user) {
      const nextAttempts = (user.verification_attempts ?? 0) + 1;
      if (nextAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + VERIFICATION_LOCK_MS).toISOString();
        await repos.users.setVerificationAttemptsLock(normalizedEmail, nextAttempts, lockUntil);
        logAuthEventForRequest(req, "verification_locked_due_to_attempts", { email: maskEmail(normalizedEmail) });
      } else {
        await repos.users.bumpVerificationAttempts(normalizedEmail, nextAttempts);
      }
    }
    logAuthEventForRequest(req, "verification_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid verification code.");
    return;
  }
  if (new Date(user.verification_expires_at) < new Date()) {
    logAuthEventForRequest(req, "verification_expired", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Code has expired. Please request a new one.");
    return;
  }

  await repos.users.verifySuccess(normalizedEmail);

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "verification_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email is required.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findForLogin(normalizedEmail);

  // Generic success response to avoid account enumeration.
  if (!user || !Number(user.is_verified)) {
    logAuthEventForRequest(req, "password_reset_request_ignored", { email: maskEmail(normalizedEmail) });
    res.json({ ok: true });
    return;
  }

  const result = await sendPasswordResetCode(normalizedEmail, { enforceResendCooldown: true });
  if (!result.sent && result.reason === "resend_cooldown") {
    logAuthEventForRequest(req, "password_reset_cooldown", { email: maskEmail(normalizedEmail) });
    sendError(
      req,
      res,
      429,
      "Please wait before requesting another reset code.",
      { retryAfterSeconds: Math.ceil((result.retryAfterMs ?? 0) / 1000) }
    );
    return;
  }
  if (!result.sent) {
    logAuthEventForRequest(req, "password_reset_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: result.reason || "unknown",
    });
    sendError(req, res, 502, "Could not send password reset email. Please try again shortly.");
    return;
  }

  logAuthEventForRequest(req, "password_reset_requested", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, code, password } = req.body ?? {};
  if (!email || !code || !password) {
    sendError(req, res, 400, "Email, code, and new password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    sendError(req, res, 400, "Password must be at least 8 characters.");
    return;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    sendError(req, res, 400, "Password must include both letters and numbers.");
    return;
  }
  if (password.length > 128) {
    sendError(req, res, 400, "Password is too long.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findPasswordResetState(normalizedEmail);

  if (!user) {
    logAuthEventForRequest(req, "password_reset_failed_unknown_user", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid reset code.");
    return;
  }

  if (user.password_reset_locked_until && new Date(user.password_reset_locked_until) > new Date()) {
    logAuthEventForRequest(req, "password_reset_locked", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many failed attempts. Please try again later.");
    return;
  }

  if (!user.password_reset_code || user.password_reset_code !== String(code).trim()) {
    const nextAttempts = (user.password_reset_attempts ?? 0) + 1;
    if (nextAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + PASSWORD_RESET_LOCK_MS).toISOString();
      await repos.users.setPasswordResetAttemptsLock(normalizedEmail, nextAttempts, lockUntil);
      logAuthEventForRequest(req, "password_reset_locked_due_to_attempts", { email: maskEmail(normalizedEmail) });
    } else {
      await repos.users.bumpPasswordResetAttempts(normalizedEmail, nextAttempts);
    }
    logAuthEventForRequest(req, "password_reset_failed_invalid_code", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid reset code.");
    return;
  }

  if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
    logAuthEventForRequest(req, "password_reset_expired", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Reset code has expired. Please request a new one.");
    return;
  }

  const passwordHash = hashPassword(password);
  await repos.users.updatePasswordClearReset(normalizedEmail, passwordHash);

  await repos.authSessions.deleteAllForUser(normalizedEmail);

  logAuthEventForRequest(req, "password_reset_success", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

// --- AADSAS Export ---

app.get("/api/export/aadsas", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await repos.projects.listByUser(userId);
  const projects = await Promise.all(
    rows.map(async (p) => {
      const sessions = await repos.projects.sessionsByProject(p.id);
      return { ...mapProjectRow(p), sessions: sessions.map(mapSessionRow) };
    })
  );

  const records = toAadsasRecords(projects);

  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="aadsas_export.csv"');
    res.send(toCsv(records));
    return;
  }

  res.json(records);
});

// SPA fallback — local Express only (CloudFront serves the SPA from S3)
if (!process.env.AWS_EXECUTION_ENV) {
  app.get("*", (_req, res) => {
    res.sendFile(join(__dirname, "../dist/index.html"));
  });
}

if (process.env.SENTRY_DSN?.trim()) {
  const Sentry = await import("@sentry/node");
  Sentry.setupExpressErrorHandler(app);
}

export default app;

// Bind loopback only — Caddy proxies from :443; avoids exposing the API on :3000 publicly.
if (!process.env.AWS_EXECUTION_ENV) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server listening on 127.0.0.1:${PORT}`);
  });
}
