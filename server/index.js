import express from "express";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { toAadsasRecords, toCsv } from "./export.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
// Resolved relative to this file's directory — works regardless of cwd
const DB_PATH = process.env.SQLITE_PATH || join(__dirname, "shadowing.db");

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
const VERIFICATION_TTL_MS = clamp(envInt("VERIFICATION_TTL_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const VERIFICATION_RESEND_COOLDOWN_MS = clamp(envInt("VERIFICATION_RESEND_COOLDOWN_MS", 60 * 1000), 10 * 1000, 10 * 60 * 1000);
const VERIFICATION_MAX_ATTEMPTS = clamp(envInt("VERIFICATION_MAX_ATTEMPTS", 5), 3, 10);
const VERIFICATION_LOCK_MS = clamp(envInt("VERIFICATION_LOCK_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const SESSION_TTL_MS = clamp(envInt("SESSION_TTL_MS", 7 * 24 * 60 * 60 * 1000), 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000);
const SESSION_REFRESH_THRESHOLD_MS = clamp(
  envInt("SESSION_REFRESH_THRESHOLD_MS", 24 * 60 * 60 * 1000),
  5 * 60 * 1000,
  SESSION_TTL_MS
);
const SESSION_COOKIE_NAME = "shadowing_session";
const LOGIN_RATE_WINDOW_MS = clamp(envInt("LOGIN_RATE_WINDOW_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
const LOGIN_MAX_ATTEMPTS_PER_IP = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_IP", 10), 3, 100);
const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 10), 3, 100);
const AUTH_LOGGING_ENABLED = process.env.AUTH_LOGGING_ENABLED !== "false";

const loginAttemptsByIp = new Map();
const loginAttemptsByAccount = new Map();

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

function isRateLimited(store, key, maxAttempts, windowMs, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return false;
  if (now - entry.windowStart > windowMs) {
    store.delete(key);
    return false;
  }
  return entry.count >= maxAttempts;
}

function recordFailedAttempt(store, key, windowMs, now = Date.now()) {
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  store.set(key, entry);
}

const app = express();
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const inboundId = req.headers["x-request-id"];
  const requestId = typeof inboundId === "string" && inboundId.trim()
    ? inboundId.trim()
    : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});
app.use(express.json());
app.use(express.static(join(__dirname, "../dist")));

const openDb = async () => {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    create table if not exists clinics (
      id text primary key,
      name text not null,
      address text not null,
      phone text,
      lat real not null,
      lng real not null,
      zip text,
      shadowing_status text not null default 'mixed',
      notes text,
      last_verified_at text
    );

    create table if not exists shadowing_requests (
      id text primary key,
      clinic_id text not null,
      created_at text default (datetime('now')),
      foreign key (clinic_id) references clinics(id)
    );

    create table if not exists experiences (
      id text primary key,
      experience_type text not null,
      organization_name text not null,
      address text,
      address2 text,
      city text,
      state_province text,
      country text,
      zip text,
      supervisor_first_name text,
      supervisor_last_name text,
      supervisor_title text,
      supervisor_phone text,
      supervisor_email text,
      hours real not null default 0,
      date_start text,
      date_end text,
      notes text,
      created_at text default (datetime('now'))
    );

    -- New schema: projects (clinic placements)
    create table if not exists projects (
      id text primary key,
      name text not null,
      clinic_id text,
      experience_type text,
      address text,
      address2 text,
      city text,
      state_province text,
      country text,
      zip text,
      supervisor_first_name text,
      supervisor_last_name text,
      supervisor_title text,
      supervisor_phone text,
      supervisor_email text,
      status text,
      description text,
      notes text,
      created_at text default (datetime('now')),
      foreign key (clinic_id) references clinics(id)
    );

    create table if not exists users (
      email text primary key,
      password_hash text not null,
      created_at text default (datetime('now'))
    );

    -- New schema: sessions (individual visit logs per project)
    create table if not exists sessions (
      id text primary key,
      project_id text not null,
      date text,
      hours real not null default 0,
      notes text,
      created_at text default (datetime('now')),
      foreign key (project_id) references projects(id)
    );
  `);

  // Migration: add Figure 2 columns if missing
  const newCols = [
    ["avg_weekly_hours", "real"],
    ["number_of_weeks", "real"],
    ["current_experience", "integer default 0"],
    ["status", "text"],
    ["title", "text"],
    ["type_compensated", "integer default 0"],
    ["type_academic_credit", "integer default 0"],
    ["type_volunteer", "integer default 0"],
    ["description", "text"]
  ];
  for (const [col, def] of newCols) {
    try {
      await db.run(`alter table experiences add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  // Migration: experiences user_id
  try {
    await db.run("alter table experiences add column user_id text");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  // Migration: projects extra columns
  const projectCols = [
    ["user_id", "text"],
    ["date_start", "text"],
  ];
  for (const [col, def] of projectCols) {
    try {
      await db.run(`alter table projects add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  // Migration: sessions extra columns (placeholder for future additions)
  const sessionCols = [
    // e.g. ["some_future_col", "text"]
  ];
  for (const [col, def] of sessionCols) {
    try {
      await db.run(`alter table sessions add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  // Migration: clinic lock columns for shadowing request cooldown
  const clinicLockCols = [
    ["lock_expires_at", "text"],
    ["locked_by_request_id", "text"]
  ];
  for (const [col, def] of clinicLockCols) {
    try {
      await db.run(`alter table clinics add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  // Migration: primary specialty (required per clinic)
  try {
    await db.run("alter table clinics add column primary_specialty text default 'gp'");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  // Migration: secondary filters (JSON array, optional)
  try {
    await db.run("alter table clinics add column secondary_filters text default '[]'");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  // Migration: clinic email (optional)
  try {
    await db.run("alter table clinics add column email text");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  // Migration: auth_sessions table (server-issued tokens — NOT the project sessions table)
  await db.run(`
    create table if not exists auth_sessions (
      token text primary key,
      user_id text not null,
      created_at text not null
    )
  `);

  // Migration: email verification fields on users
  for (const col of [
    "alter table users add column is_verified integer not null default 0",
    "alter table users add column verification_code text",
    "alter table users add column verification_expires_at text",
    "alter table users add column verification_sent_at text",
    "alter table users add column verification_attempts integer not null default 0",
    "alter table users add column verification_locked_until text",
  ]) {
    try {
      await db.run(col);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  return db;
};

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

const mapClinicRow = (row) => {
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
    lockedByRequestId: row.locked_by_request_id ?? null
  };
};


const db = await openDb();

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
  return cookies[SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res, token) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`
  );
}

function clearSessionCookie(res) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
  );
}

async function issueSession(userId, res) {
  const token = randomBytes(32).toString("hex");
  await db.run(
    "insert into auth_sessions (token, user_id, created_at) values (?, ?, ?)",
    [token, userId, new Date().toISOString()]
  );
  setSessionCookie(res, token);
  return token;
}

async function getUserIdFromToken(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  const row = await db.get(
    "select user_id, created_at from auth_sessions where token = ?",
    [token]
  );
  if (!row) return null;

  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > SESSION_TTL_MS) {
    await db.run("delete from auth_sessions where token = ?", [token]);
    return null;
  }

  // Sliding session: refresh active sessions at most once per threshold window.
  if (age > SESSION_REFRESH_THRESHOLD_MS && req.res) {
    await db.run(
      "update auth_sessions set created_at = ? where token = ?",
      [new Date().toISOString(), token]
    );
    setSessionCookie(req.res, token);
  }

  return row.user_id;
}

app.get("/api/clinics", async (_req, res) => {
  const rows = await db.all("select * from clinics order by name");
  res.json(rows.map(mapClinicRow));
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
  await db.run(
    `insert into clinics (id, name, address, phone, email, lat, lng, zip, shadowing_status, primary_specialty, secondary_filters, notes, last_verified_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      address,
      phone ?? "",
      email ?? "",
      lat,
      lng,
      zip ?? "",
      shadowingStatus ?? "mixed",
      primarySpecialty ?? "gp",
      secondaryFiltersJson,
      notes ?? "",
      lastVerifiedAt
    ]
  );

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

  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  const secondaryFiltersJson = Array.isArray(secondaryFilters)
    ? JSON.stringify(secondaryFilters)
    : "[]";
  await db.run(
    `update clinics
     set name = ?, address = ?, phone = ?, email = ?, lat = ?, lng = ?, zip = ?, shadowing_status = ?, primary_specialty = ?, secondary_filters = ?, notes = ?, last_verified_at = ?
     where id = ?`,
    [
      name,
      address,
      phone ?? "",
      email ?? "",
      lat,
      lng,
      zip ?? "",
      shadowingStatus ?? "mixed",
      primarySpecialty ?? "gp",
      secondaryFiltersJson,
      notes ?? "",
      lastVerifiedAt,
      id
    ]
  );

  res.json({ ok: true });
});

// Delete all clinics (and their shadowing_requests). Use with care.
app.delete("/api/clinics", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db.run("delete from shadowing_requests");
  const result = await db.run("delete from clinics");
  res.json({ ok: true, deleted: result.changes });
});

// --- Shadowing request (first-come lock + cooldown) ---

app.post("/api/clinics/:id/request", async (req, res) => {
  const { id: clinicId } = req.params;
  if (!clinicId) {
    res.status(400).json({ error: "Clinic ID required." });
    return;
  }

  const clinic = await db.get("select * from clinics where id = ?", [clinicId]);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }

  if (clinic.shadowing_status !== "available") {
    res.status(400).json({
      error: "This clinic is not available for shadowing requests."
    });
    return;
  }

  const now = new Date().toISOString();
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
  await db.run(
    "insert into shadowing_requests (id, clinic_id) values (?, ?)",
    [requestId, clinicId]
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COOLDOWN_DAYS);
  const expiresAtIso = expiresAt.toISOString();

  await db.run(
    "update clinics set lock_expires_at = ?, locked_by_request_id = ? where id = ?",
    [expiresAtIso, requestId, clinicId]
  );

  const updated = await db.get("select * from clinics where id = ?", [clinicId]);
  res.status(201).json({
    requestId,
    lockExpiresAt: expiresAtIso,
    clinic: mapClinicRow(updated)
  });
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
  let sql = "select * from experiences where user_id = ?";
  const params = [userId];

  if (clinic) {
    sql += " and lower(organization_name) like lower(?)";
    params.push(`%${clinic}%`);
  }
  if (supervisor) {
    sql += " and (lower(supervisor_first_name) like lower(?) or lower(supervisor_last_name) like lower(?))";
    params.push(`%${supervisor}%`, `%${supervisor}%`);
  }
  if (phone) {
    sql += " and supervisor_phone like ?";
    params.push(`%${phone}%`);
  }
  if (email) {
    sql += " and lower(supervisor_email) like lower(?)";
    params.push(`%${email}%`);
  }
  if (type) {
    sql += " and experience_type = ?";
    params.push(type);
  }

  sql += " order by date_start desc, created_at desc";
  const rows = await db.all(sql, params);
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
  await db.run(
    `insert into experiences (
      id, user_id, experience_type, organization_name, address, address2, city, state_province, country, zip,
      supervisor_first_name, supervisor_last_name, supervisor_title, supervisor_phone, supervisor_email,
      hours, date_start, date_end, notes, description, avg_weekly_hours, number_of_weeks,
      current_experience, status, title, type_compensated, type_academic_credit, type_volunteer
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      experienceType ?? "dental_shadowing_in_person",
      organizationName,
      address ?? "",
      address2 ?? "",
      city ?? "",
      stateProvince ?? "",
      country ?? "",
      zip ?? "",
      supervisorFirstName ?? "",
      supervisorLastName ?? "",
      supervisorTitle ?? "",
      supervisorPhone ?? "",
      supervisorEmail ?? "",
      hoursNum,
      dateStart ?? "",
      dateEnd ?? "",
      notes ?? "",
      description ?? "",
      avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
      numberOfWeeks != null ? Number(numberOfWeeks) : null,
      currentExperience ? 1 : 0,
      status ?? "",
      title ?? "",
      typeCompensated ? 1 : 0,
      typeAcademicCredit ? 1 : 0,
      typeVolunteer ? 1 : 0,
    ]
  );

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

  const result = await db.run(
    `update experiences set
      experience_type = ?, organization_name = ?, address = ?, address2 = ?, city = ?, state_province = ?, country = ?, zip = ?,
      supervisor_first_name = ?, supervisor_last_name = ?, supervisor_title = ?, supervisor_phone = ?, supervisor_email = ?,
      hours = ?, date_start = ?, date_end = ?, notes = ?, description = ?, avg_weekly_hours = ?, number_of_weeks = ?,
      current_experience = ?, status = ?, title = ?, type_compensated = ?, type_academic_credit = ?, type_volunteer = ?
    where id = ? and user_id = ?`,
    [
      experienceType ?? "dental_shadowing_in_person",
      organizationName,
      address ?? "",
      address2 ?? "",
      city ?? "",
      stateProvince ?? "",
      country ?? "",
      zip ?? "",
      supervisorFirstName ?? "",
      supervisorLastName ?? "",
      supervisorTitle ?? "",
      supervisorPhone ?? "",
      supervisorEmail ?? "",
      hoursNum,
      dateStart ?? "",
      dateEnd ?? "",
      notes ?? "",
      description ?? "",
      avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
      numberOfWeeks != null ? Number(numberOfWeeks) : null,
      currentExperience ? 1 : 0,
      status ?? "",
      title ?? "",
      typeCompensated ? 1 : 0,
      typeAcademicCredit ? 1 : 0,
      typeVolunteer ? 1 : 0,
      id,
      userId,
    ]
  );

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
  const result = await db.run(
    "delete from experiences where id = ? and user_id = ?",
    [id, userId]
  );
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
  const rows = await db.all(
    "select * from projects where user_id = ? order by created_at desc",
    [userId]
  );
  const result = await Promise.all(
    rows.map(async (p) => {
      const sessions = await db.all(
        "select * from sessions where project_id = ? order by date asc, created_at asc",
        [p.id]
      );
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
  await db.run(
    `insert into projects (
      id, user_id, name, date_start, clinic_id, experience_type,
      address, address2, city, state_province, country, zip,
      supervisor_first_name, supervisor_last_name, supervisor_title,
      supervisor_phone, supervisor_email,
      status, description, notes
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, name, dateStart, clinicId ?? null, experienceType ?? null,
      address ?? "", address2 ?? "", city ?? "", stateProvince ?? "", country ?? "", zip ?? "",
      supervisorFirstName ?? "", supervisorLastName ?? "", supervisorTitle ?? "",
      supervisorPhone ?? "", supervisorEmail ?? "",
      status ?? "", description ?? "", notes ?? "",
    ]
  );

  res.status(201).json({ id });
});

app.post("/api/projects/:id/sessions", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id: projectId } = req.params;

  const project = await db.get(
    "select id from projects where id = ? and user_id = ?",
    [projectId, userId]
  );
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
  await db.run(
    "insert into sessions (id, project_id, date, hours, notes) values (?, ?, ?, ?, ?)",
    [id, projectId, date ?? null, hoursNum, notes ?? ""]
  );

  res.status(201).json({ id });
});

app.get("/api/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  const project = await db.get(
    "select * from projects where id = ? and user_id = ?",
    [id, userId]
  );
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const sessions = await db.all(
    "select * from sessions where project_id = ? order by date asc, created_at asc",
    [id]
  );

  res.json({ ...mapProjectRow(project), sessions: sessions.map(mapSessionRow) });
});

app.delete("/api/projects/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const project = await db.get(
    "select id from projects where id = ? and user_id = ?",
    [id, userId]
  );
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await db.run("delete from sessions where project_id = ?", [id]);
  await db.run("delete from projects where id = ?", [id]);
  res.json({ ok: true });
});

app.delete("/api/projects/:id/sessions/:sessionId", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id: projectId, sessionId } = req.params;
  const project = await db.get(
    "select id from projects where id = ? and user_id = ?",
    [projectId, userId]
  );
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await db.run("delete from sessions where id = ? and project_id = ?", [sessionId, projectId]);
  res.json({ ok: true });
});

// --- Auth endpoints ---

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  if (!isValidEduEmail(email)) {
    res.status(400).json({ error: "A valid .edu email address is required." });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  if (password.length > 128) {
    res.status(400).json({ error: "Password is too long." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.get("select email from users where email = ?", [normalizedEmail]);
  if (existing) {
    logAuthEventForRequest(req, "register_conflict", { email: maskEmail(normalizedEmail) });
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = hashPassword(password);
  await db.run(
    "insert into users (email, password_hash) values (?, ?)",
    [normalizedEmail, passwordHash]
  );

  logAuthEventForRequest(req, "register_success", { email: maskEmail(normalizedEmail) });

  res.status(201).json({ email: normalizedEmail });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }
  if (!isValidEduEmail(email)) {
    res.status(400).json({ error: "A valid .edu email address is required." });
    return;
  }

  const now = Date.now();
  const ipKey = `ip:${req.ip || "unknown"}`;
  const normalizedEmail = email.trim().toLowerCase();

  if (
    isRateLimited(loginAttemptsByIp, ipKey, LOGIN_MAX_ATTEMPTS_PER_IP, LOGIN_RATE_WINDOW_MS, now) ||
    isRateLimited(loginAttemptsByAccount, normalizedEmail, LOGIN_MAX_ATTEMPTS_PER_ACCOUNT, LOGIN_RATE_WINDOW_MS, now)
  ) {
    logAuthEventForRequest(req, "login_rate_limited", { email: maskEmail(normalizedEmail) });
    res.status(429).json({ error: "Too many login attempts. Try again in 10 minutes." });
    return;
  }

  const user = await db.get(
    "select email, password_hash, is_verified from users where email = ?",
    [normalizedEmail]
  );

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedAttempt(loginAttemptsByIp, ipKey, LOGIN_RATE_WINDOW_MS, now);
    recordFailedAttempt(loginAttemptsByAccount, normalizedEmail, LOGIN_RATE_WINDOW_MS, now);
    logAuthEventForRequest(req, "login_failed", { email: maskEmail(normalizedEmail) });
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  loginAttemptsByAccount.delete(normalizedEmail);

  if (!user.is_verified) {
    await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
    logAuthEventForRequest(req, "login_unverified", { email: maskEmail(normalizedEmail) });
    res.status(403).json({ error: "email_not_verified", email: normalizedEmail });
    return;
  }

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "login_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});

app.delete("/api/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    await db.run("delete from auth_sessions where token = ?", [token]);
  }
  clearSessionCookie(res);
  logAuthEventForRequest(req, "logout", { hadSession: !!token });
  res.json({ ok: true });
});

app.get("/api/auth/session", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    clearSessionCookie(res);
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, email: userId });
});

// --- Email verification ---

async function sendVerificationCode(email, options = {}) {
  const { enforceResendCooldown = false } = options;
  const existing = await db.get(
    "select verification_sent_at from users where email = ?",
    [email]
  );

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

  await db.run(
    `update users
     set verification_code = ?,
         verification_expires_at = ?,
         verification_sent_at = ?,
         verification_attempts = 0,
         verification_locked_until = null
     where email = ?`,
    [code, expiresAt, nowIso, email]
  );

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "Shadow Network <noreply@shadowingnetwork.com>";
  if (!apiKey) return { sent: true };

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Your Shadow Network verification code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Enter this code to complete sign-in:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;padding:1rem;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#888;font-size:0.875rem">Expires in 10 minutes. If you did not request this, ignore this email.</p>
        </div>
      `,
    }),
  }).catch(() => {});

  return { sent: true };
}

app.post("/api/auth/send-verification", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !isValidEduEmail(email)) {
    res.status(400).json({ error: "A valid .edu email is required." });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.get("select email from users where email = ?", [normalizedEmail]);

  // Always return a generic success envelope to avoid account enumeration.
  if (!user) {
    logAuthEventForRequest(req, "verification_send_unknown_account", { email: maskEmail(normalizedEmail) });
    res.json({ ok: true });
    return;
  }

  const result = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
  if (!result.sent && result.reason === "resend_cooldown") {
    logAuthEventForRequest(req, "verification_send_cooldown", { email: maskEmail(normalizedEmail) });
    res.status(429).json({
      error: "Please wait before requesting another verification code.",
      retryAfterSeconds: Math.ceil((result.retryAfterMs ?? 0) / 1000),
    });
    return;
  }

  logAuthEventForRequest(req, "verification_send", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

app.post("/api/auth/verify", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    res.status(400).json({ error: "Email and code are required." });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.get(
    `select verification_code, verification_expires_at, verification_attempts, verification_locked_until
     from users where email = ?`,
    [normalizedEmail]
  );

  if (user?.verification_locked_until && new Date(user.verification_locked_until) > new Date()) {
    logAuthEventForRequest(req, "verification_locked", { email: maskEmail(normalizedEmail) });
    res.status(429).json({ error: "Too many failed attempts. Please try again later." });
    return;
  }

  if (!user || user.verification_code !== String(code).trim()) {
    if (user) {
      const nextAttempts = (user.verification_attempts ?? 0) + 1;
      if (nextAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + VERIFICATION_LOCK_MS).toISOString();
        await db.run(
          "update users set verification_attempts = ?, verification_locked_until = ? where email = ?",
          [nextAttempts, lockUntil, normalizedEmail]
        );
        logAuthEventForRequest(req, "verification_locked_due_to_attempts", { email: maskEmail(normalizedEmail) });
      } else {
        await db.run(
          "update users set verification_attempts = ? where email = ?",
          [nextAttempts, normalizedEmail]
        );
      }
    }
    logAuthEventForRequest(req, "verification_failed", { email: maskEmail(normalizedEmail) });
    res.status(400).json({ error: "Invalid verification code." });
    return;
  }
  if (new Date(user.verification_expires_at) < new Date()) {
    logAuthEventForRequest(req, "verification_expired", { email: maskEmail(normalizedEmail) });
    res.status(400).json({ error: "Code has expired. Please request a new one." });
    return;
  }

  await db.run(
    `update users
     set is_verified = 1,
         verification_code = null,
         verification_expires_at = null,
         verification_sent_at = null,
         verification_attempts = 0,
         verification_locked_until = null
     where email = ?`,
    [normalizedEmail]
  );

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "verification_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});

// --- AADSAS Export ---

app.get("/api/export/aadsas", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await db.all(
    "select * from projects where user_id = ? order by created_at desc",
    [userId]
  );
  const projects = await Promise.all(
    rows.map(async (p) => {
      const sessions = await db.all(
        "select * from sessions where project_id = ? order by date asc, created_at asc",
        [p.id]
      );
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

// SPA fallback — any non-API route returns index.html
app.get("*", (_req, res) => {
  res.sendFile(join(__dirname, "../dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
