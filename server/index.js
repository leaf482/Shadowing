import express from "express";
import { randomUUID } from "crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.SQLITE_PATH || "./server/shadowing.db";

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

  return db;
};

const mapClinicRow = (row) => ({
  id: row.id,
  name: row.name,
  address: row.address,
  phone: row.phone,
  lat: row.lat,
  lng: row.lng,
  zip: row.zip,
  shadowingStatus: row.shadowing_status,
  notes: row.notes,
  lastVerifiedAt: row.last_verified_at
});


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
    lat,
    lng,
    zip,
    shadowingStatus,
    notes
  } = req.body ?? {};

  if (!name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const id = randomUUID();
  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  await db.run(
    `insert into clinics (id, name, address, phone, lat, lng, zip, shadowing_status, notes, last_verified_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      address,
      phone ?? "",
      lat,
      lng,
      zip ?? "",
      shadowingStatus ?? "mixed",
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
    lat,
    lng,
    zip,
    shadowingStatus,
    notes
  } = req.body ?? {};

  if (!id || !name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  await db.run(
    `update clinics
     set name = ?, address = ?, phone = ?, lat = ?, lng = ?, zip = ?, shadowing_status = ?, notes = ?, last_verified_at = ?
     where id = ?`,
    [
      name,
      address,
      phone ?? "",
      lat,
      lng,
      zip ?? "",
      shadowingStatus ?? "mixed",
      notes ?? "",
      lastVerifiedAt,
      id
    ]
  );

  res.json({ ok: true });
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

app.listen(PORT, () => {
  console.log(`SQLite API listening on http://localhost:${PORT}`);
});
