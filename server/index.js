import express from "express";
import { randomUUID } from "crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const PORT = process.env.PORT || 5174;
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
  `);

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


app.listen(PORT, () => {
  console.log(`SQLite API listening on http://localhost:${PORT}`);
});
