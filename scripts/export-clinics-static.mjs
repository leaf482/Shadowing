import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRepositories } from "../server/repositories/createRepositories.js";
import { writeClinicsSnapshotRows } from "../server/clinicsSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outPath = join(repoRoot, "server", "generated", "clinics.json");

/** Minimal KEY=value loader so `npm run build` matches production `.env` (e.g. DATA_BACKEND=dynamo). */
function loadDotEnv(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (!key) continue;
      if (
        (val.startsWith('"') && val.endsWith('"'))
        || (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* missing or unreadable */
  }
}

async function main() {
  loadDotEnv(join(repoRoot, ".env"));
  await mkdir(dirname(outPath), { recursive: true });
  try {
    const repos = await createRepositories();
    const rows = await repos.clinics.selectAllOrdered();
    await writeClinicsSnapshotRows(rows, outPath);
    console.log(`export-clinics-static: wrote ${outPath} (${rows.length} clinics, backend=${repos.backend})`);
  } catch (err) {
    await writeFile(outPath, "[]\n", "utf8");
    console.warn(`export-clinics-static: failed (${err.message}) — wrote empty ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
