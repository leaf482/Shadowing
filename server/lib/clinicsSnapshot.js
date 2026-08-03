import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { writeClinicsSnapshotRows } from "../clinicsSnapshot.js";
import { publishClinicsSnapshotCdn } from "../publishClinicsSnapshotCdn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CLINICS_SNAPSHOT_PATH = process.env.AWS_EXECUTION_ENV
  ? join("/tmp", "clinics.json")
  : join(__dirname, "../generated", "clinics.json");

export function createClinicsSnapshotRefresher(repos) {
  return async function refreshClinicsSnapshot() {
    try {
      const rows = await repos.clinics.selectAllOrdered();
      await writeClinicsSnapshotRows(rows, CLINICS_SNAPSHOT_PATH);
      await publishClinicsSnapshotCdn(CLINICS_SNAPSHOT_PATH);
    } catch (error) {
      console.error("[clinics snapshot]", error);
    }
  };
}
