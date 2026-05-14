/**
 * Copy all rows from SQLite (production schema) into DynamoDB tables.
 *
 * Prerequisites:
 *   - AWS credentials (env, ~/.aws, or EC2 instance profile)
 *   - Tables already exist (e.g. `sam deploy` first)
 *
 * Usage:
 *   export AWS_REGION=us-west-2
 *   export SQLITE_PATH=./server/shadowing.db
 *   export TABLE_CLINICS=... TABLE_USERS=... (see stack Outputs or .env.dynamo)
 *   node scripts/migrate-sqlite-to-dynamo.mjs
 *
 * Safe to re-run only if tables are empty; otherwise clears matching keys first
 * is NOT implemented — use fresh tables or wipe in AWS console.
 */

import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const SQLITE_PATH = process.env.SQLITE_PATH || join(repoRoot, "server", "shadowing.db");
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);

const TABLES = {
  clinics: process.env.TABLE_CLINICS,
  users: process.env.TABLE_USERS,
  auth_sessions: process.env.TABLE_AUTH_SESSIONS,
  shadowing_requests: process.env.TABLE_SHADOWING_REQUESTS,
  experiences: process.env.TABLE_EXPERIENCES,
  projects: process.env.TABLE_PROJECTS,
  sessions: process.env.TABLE_PLACEMENT_SESSIONS,
  admin_audit_logs: process.env.TABLE_AUDIT_LOGS,
  clinic_quality_flags: process.env.TABLE_QUALITY_FLAGS
};

function requireEnv() {
  const missing = Object.entries(TABLES)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error("Missing DynamoDB table env for:", missing.join(", "));
    console.error("Required: TABLE_CLINICS, TABLE_USERS, TABLE_AUTH_SESSIONS, TABLE_SHADOWING_REQUESTS,");
    console.error("TABLE_EXPERIENCES, TABLE_PROJECTS, TABLE_PLACEMENT_SESSIONS, TABLE_AUDIT_LOGS, TABLE_QUALITY_FLAGS");
    process.exit(1);
  }
}

function cleanItem(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

async function batchWriteAll(doc, tableName, items) {
  let chunk = [];
  for (const row of items) {
    chunk.push({ PutRequest: { Item: cleanItem(row) } });
    if (chunk.length === 25) {
      await flushChunk(doc, tableName, chunk);
      chunk = [];
    }
  }
  if (chunk.length) await flushChunk(doc, tableName, chunk);
}

async function flushChunk(doc, tableName, requests) {
  let req = { RequestItems: { [tableName]: requests } };
  let attempts = 0;
  while (true) {
    const out = await doc.send(new BatchWriteCommand(req));
    const unproc = out.UnprocessedItems?.[tableName];
    if (!unproc?.length) return;
    req = { RequestItems: { [tableName]: unproc } };
    attempts += 1;
    if (attempts > 12) throw new Error(`BatchWrite still has unprocessed items for ${tableName}`);
    await new Promise((r) => setTimeout(r, Math.min(2000, 100 * 2 ** attempts)));
  }
}

function authSessionTtl(createdAtIso) {
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return Math.floor(Date.now() / 1000) + Math.ceil(SESSION_TTL_MS / 1000);
  return Math.floor((t + SESSION_TTL_MS) / 1000);
}

async function main() {
  requireEnv();

  const db = await open({ filename: SQLITE_PATH, driver: sqlite3.Database });

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const client = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`Region: ${region}`);

  const clinics = await db.all("select * from clinics");
  await batchWriteAll(doc, TABLES.clinics, clinics);
  console.log(`clinics: ${clinics.length}`);

  const users = await db.all("select * from users");
  await batchWriteAll(doc, TABLES.users, users);
  console.log(`users: ${users.length}`);

  const authSessions = await db.all("select * from auth_sessions");
  const authItems = authSessions.map((r) => ({
    ...r,
    ttl: authSessionTtl(r.created_at)
  }));
  await batchWriteAll(doc, TABLES.auth_sessions, authItems);
  console.log(`auth_sessions: ${authItems.length}`);

  const shadowingRequests = await db.all("select * from shadowing_requests");
  await batchWriteAll(doc, TABLES.shadowing_requests, shadowingRequests);
  console.log(`shadowing_requests: ${shadowingRequests.length}`);

  const experiences = await db.all("select * from experiences");
  await batchWriteAll(doc, TABLES.experiences, experiences);
  console.log(`experiences: ${experiences.length}`);

  const projects = await db.all("select * from projects");
  await batchWriteAll(doc, TABLES.projects, projects);
  console.log(`projects: ${projects.length}`);

  const sessions = await db.all("select * from sessions");
  await batchWriteAll(doc, TABLES.sessions, sessions);
  console.log(`sessions (placement): ${sessions.length}`);

  const auditLogs = await db.all("select * from admin_audit_logs");
  await batchWriteAll(doc, TABLES.admin_audit_logs, auditLogs);
  console.log(`admin_audit_logs: ${auditLogs.length}`);

  const flags = await db.all("select * from clinic_quality_flags");
  await batchWriteAll(doc, TABLES.clinic_quality_flags, flags);
  console.log(`clinic_quality_flags: ${flags.length}`);

  await db.close();
  console.log("Migration finished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
