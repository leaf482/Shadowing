import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRepositories } from "../server/repositories/createRepositories.js";
import { writeClinicsSnapshotRows } from "../server/clinicsSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outPath = join(repoRoot, "server", "generated", "clinics.json");

async function main() {
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
