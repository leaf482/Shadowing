import { canManageClinic } from "./admin.js";

export function mapClinicRow(row, viewerUserId = null) {
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
    lockExpiresAt: row.lock_expires_at ?? null,
    lockedByRequestId: row.locked_by_request_id ?? null,
    ownedByCurrentUser: !!viewerUserId && row.created_by_user_id === viewerUserId,
    canManage: canManageClinic(row, viewerUserId),
  };
}
