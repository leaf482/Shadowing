import { open } from "sqlite";
import { randomUUID } from "crypto";
import sqlite3 from "sqlite3";

const DB_PATH = process.env.SQLITE_PATH || "./server/shadowing.db";

const seedClinics = [
  {
    name: "Tacoma Smiles Dental",
    address: "1107 Martin Luther King Jr Way, Tacoma, WA",
    phone: "(253) 555-0131",
    lat: 47.2478,
    lng: -122.4362,
    zip: "98405",
    shadowingStatus: "available",
    notes: "Welcomes pre-dental students on Friday mornings.",
    lastVerifiedAt: "2025-12-10"
  },
  {
    name: "Foss Dental Group",
    address: "3212 N 26th St, Tacoma, WA",
    phone: "(253) 555-0198",
    lat: 47.2729,
    lng: -122.4714,
    zip: "98407",
    shadowingStatus: "mixed",
    notes: "Availability changes each quarter; call ahead.",
    lastVerifiedAt: "2025-11-22"
  },
  {
    name: "Ruston Family Dentistry",
    address: "5005 N Pearl St, Ruston, WA",
    phone: "(253) 555-0174",
    lat: 47.3094,
    lng: -122.5191,
    zip: "98407",
    shadowingStatus: "unavailable",
    notes: "Currently not accepting shadowing students.",
    lastVerifiedAt: "2025-09-05"
  },
  {
    name: "Hilltop Oral Health Center",
    address: "1202 S L St, Tacoma, WA",
    phone: "(253) 555-0145",
    lat: 47.2492,
    lng: -122.4532,
    zip: "98405",
    shadowingStatus: "available",
    notes: "Shadowing offered Mon-Wed, 8am-12pm.",
    lastVerifiedAt: "2025-12-01"
  },
  {
    name: "Stadium Dental Studio",
    address: "3102 N 30th St, Tacoma, WA",
    phone: "(253) 555-0116",
    lat: 47.2732,
    lng: -122.4729,
    zip: "98407",
    shadowingStatus: "mixed",
    notes: "Usually accepts 1 student per month.",
    lastVerifiedAt: "2025-10-18"
  },
  {
    name: "Lakewood Family Dental",
    address: "5100 100th St SW, Lakewood, WA",
    phone: "(253) 555-0127",
    lat: 47.1659,
    lng: -122.5091,
    zip: "98499",
    shadowingStatus: "available",
    notes: "Prefers 2+ week notice.",
    lastVerifiedAt: "2025-12-07"
  }
];

const run = async () => {
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

  const existing = await db.get("select count(*) as count from clinics");
  if (existing.count > 0) {
    console.log("Seed skipped: clinics table already has data.");
    return;
  }

  const insertSql = `
    insert into clinics
      (id, name, address, phone, lat, lng, zip, shadowing_status, notes, last_verified_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const clinic of seedClinics) {
    await db.run(insertSql, [
      randomUUID(),
      clinic.name,
      clinic.address,
      clinic.phone,
      clinic.lat,
      clinic.lng,
      clinic.zip,
      clinic.shadowingStatus,
      clinic.notes,
      clinic.lastVerifiedAt
    ]);
  }

  console.log("Seed complete.");
};

run();
