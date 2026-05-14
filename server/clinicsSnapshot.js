import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

/** Same public shape as mapClinicRow without locks or per-user flags (for CDN-friendly snapshot). */
export function rowToPublicSnapshot(row) {
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
    lockExpiresAt: null,
    lockedByRequestId: null,
    ownedByCurrentUser: false,
    canManage: false
  };
}

export async function writeClinicsSnapshotFile(db, filePath) {
  const rows = await db.all("select * from clinics order by name");
  const payload = rows.map(rowToPublicSnapshot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}
