import { open } from "sqlite";
import sqlite3 from "sqlite3";

/** Opens SQLite and applies all migrations (historical schema). */
export async function openSqliteDb(filename) {
  const db = await open({
    filename,
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

  try {
    await db.run("alter table experiences add column user_id text");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  const projectCols = [
    ["user_id", "text"],
    ["date_start", "text"]
  ];
  for (const [col, def] of projectCols) {
    try {
      await db.run(`alter table projects add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  const clinicLockCols = [
    ["lock_expires_at", "text"],
    ["locked_by_request_id", "text"],
    ["created_by_user_id", "text"]
  ];
  for (const [col, def] of clinicLockCols) {
    try {
      await db.run(`alter table clinics add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  const shadowingRequestCols = [
    ["user_id", "text"],
    ["lock_expires_at", "text"],
    ["reserve_units", "integer not null default 1"]
  ];
  for (const [col, def] of shadowingRequestCols) {
    try {
      await db.run(`alter table shadowing_requests add column ${col} ${def}`);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  try {
    await db.run("alter table clinics add column primary_specialty text default 'gp'");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  try {
    await db.run("alter table clinics add column secondary_filters text default '[]'");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  try {
    await db.run("alter table clinics add column email text");
  } catch (e) {
    if (!e.message?.includes("duplicate column")) throw e;
  }

  await db.run(`
    create table if not exists auth_sessions (
      token text primary key,
      user_id text not null,
      created_at text not null
    )
  `);

  for (const col of [
    "alter table users add column is_verified integer not null default 0",
    "alter table users add column verification_code text",
    "alter table users add column verification_expires_at text",
    "alter table users add column verification_sent_at text",
    "alter table users add column verification_attempts integer not null default 0",
    "alter table users add column verification_locked_until text",
    "alter table users add column google_sub text"
  ]) {
    try {
      await db.run(col);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  for (const col of [
    "alter table users add column password_reset_code text",
    "alter table users add column password_reset_expires_at text",
    "alter table users add column password_reset_sent_at text",
    "alter table users add column password_reset_attempts integer not null default 0",
    "alter table users add column password_reset_locked_until text"
  ]) {
    try {
      await db.run(col);
    } catch (e) {
      if (!e.message?.includes("duplicate column")) throw e;
    }
  }

  await db.run(`
    create table if not exists admin_audit_logs (
      id text primary key,
      actor_user_id text not null,
      action text not null,
      target_type text,
      target_id text,
      details text,
      created_at text default (datetime('now'))
    )
  `);

  await db.run(`
    create table if not exists clinic_quality_flags (
      id text primary key,
      clinic_id text not null,
      flag_type text not null,
      notes text,
      status text not null default 'open',
      created_by_user_id text,
      resolved_by_user_id text,
      created_at text default (datetime('now')),
      resolved_at text,
      foreign key (clinic_id) references clinics(id)
    )
  `);

  return db;
}
