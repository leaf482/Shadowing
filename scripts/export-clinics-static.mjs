import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { writeClinicsSnapshotFile } from "../server/clinicsSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const dbPath = process.env.SQLITE_PATH || join(repoRoot, "server", "shadowing.db");
const outPath = join(repoRoot, "server", "generated", "clinics.json");

async function main() {
  await mkdir(dirname(outPath), { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(outPath, "[]\n", "utf8");
    console.warn(`export-clinics-static: no DB at ${dbPath} — wrote empty ${outPath}`);
    return;
  }
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await writeClinicsSnapshotFile(db, outPath);
    console.log(`export-clinics-static: wrote ${outPath}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
