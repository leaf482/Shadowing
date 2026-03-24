import express from "express";
import { randomUUID } from "crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.SQLITE_PATH || "./server/shadowing.db";
const COOLDOWN_DAYS = Math.min(21, Math.max(14, parseInt(process.env.COOLDOWN_DAYS, 10) || 14));

const app = express();
app.use(express.json());

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

  // Migration: projects extra columns
  const projectCols = [
    ["user_id", "text"],
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

  return db;
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

app.get("/api/clinics", async (_req, res) => {
  const rows = await db.all("select * from clinics order by name");
  res.json(rows.map(mapClinicRow));
});

app.post("/api/clinics", async (req, res) => {
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
app.delete("/api/clinics", async (_req, res) => {
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
  const { clinic, supervisor, phone, email, type } = req.query;
  let sql = "select * from experiences where 1=1";
  const params = [];

  if (clinic) {
    sql += " and organization_name like ?";
    params.push(`%${clinic}%`);
  }
  if (supervisor) {
    sql += " and (supervisor_first_name like ? or supervisor_last_name like ?)";
    params.push(`%${supervisor}%`, `%${supervisor}%`);
  }
  if (phone) {
    sql += " and supervisor_phone like ?";
    params.push(`%${phone}%`);
  }
  if (email) {
    sql += " and supervisor_email like ?";
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
      id, experience_type, organization_name, address, address2, city, state_province, country, zip,
      supervisor_first_name, supervisor_last_name, supervisor_title, supervisor_phone, supervisor_email,
      hours, date_start, date_end, notes, description, avg_weekly_hours, number_of_weeks,
      current_experience, status, title, type_compensated, type_academic_credit, type_volunteer
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
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

  await db.run(
    `update experiences set
      experience_type = ?, organization_name = ?, address = ?, address2 = ?, city = ?, state_province = ?, country = ?, zip = ?,
      supervisor_first_name = ?, supervisor_last_name = ?, supervisor_title = ?, supervisor_phone = ?, supervisor_email = ?,
      hours = ?, date_start = ?, date_end = ?, notes = ?, description = ?, avg_weekly_hours = ?, number_of_weeks = ?,
      current_experience = ?, status = ?, title = ?, type_compensated = ?, type_academic_credit = ?, type_volunteer = ?
    where id = ?`,
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
    ]
  );

  res.json({ ok: true });
});

app.delete("/api/experiences/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "ID required." });
    return;
  }
  await db.run("delete from experiences where id = ?", [id]);
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
  const userId = req.headers["x-user-id"] ?? null;
  if (!userId) {
    res.json([]);
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
  const userId = req.headers["x-user-id"] ?? null;
  if (!userId) {
    res.status(401).json({ error: "x-user-id header is required." });
    return;
  }

  const {
    name,
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

  const id = randomUUID();
  await db.run(
    `insert into projects (
      id, user_id, name, clinic_id, experience_type,
      address, address2, city, state_province, country, zip,
      supervisor_first_name, supervisor_last_name, supervisor_title,
      supervisor_phone, supervisor_email,
      status, description, notes
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, name, clinicId ?? null, experienceType ?? null,
      address ?? "", address2 ?? "", city ?? "", stateProvince ?? "", country ?? "", zip ?? "",
      supervisorFirstName ?? "", supervisorLastName ?? "", supervisorTitle ?? "",
      supervisorPhone ?? "", supervisorEmail ?? "",
      status ?? "", description ?? "", notes ?? "",
    ]
  );

  res.status(201).json({ id });
});

app.post("/api/projects/:id/sessions", async (req, res) => {
  const userId = req.headers["x-user-id"] ?? null;
  if (!userId) {
    res.status(401).json({ error: "x-user-id header is required." });
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
  const userId = req.headers["x-user-id"] ?? null;
  const { id } = req.params;

  const project = await db.get(
    "select * from projects where id = ?" + (userId ? " and user_id = ?" : ""),
    userId ? [id, userId] : [id]
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

app.listen(PORT, () => {
  console.log(`SQLite API listening on http://localhost:${PORT}`);
});
