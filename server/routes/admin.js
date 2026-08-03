import { Router } from "express";
import { randomUUID } from "crypto";
import { sendError } from "../lib/http.js";

const parseDetails = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapAuditLogRow = (row) => ({
  id: row.id,
  actorUserId: row.actor_user_id,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  details: parseDetails(row.details),
  createdAt: row.created_at,
});

const mapQualityFlagRow = (row) => ({
  id: row.id,
  clinicId: row.clinic_id,
  clinicName: row.clinic_name ?? null,
  flagType: row.flag_type,
  notes: row.notes ?? "",
  status: row.status,
  createdByUserId: row.created_by_user_id,
  resolvedByUserId: row.resolved_by_user_id,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

export function registerAdminRoutes(app, deps) {
  const { repos, requireAdmin, writeAuditLog } = deps;
  const router = Router();
router.get("/audit-logs", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.auditLogs.listRecent100();
  res.json(rows.map(mapAuditLogRow));
});

router.get("/reserves", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.clinics.selectActiveReservesJoin(new Date().toISOString());

  res.json(rows.map((row) => ({
    requestId: row.locked_by_request_id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    shadowingStatus: row.shadowing_status,
    userId: row.user_id || null,
    createdAt: row.created_at || null,
    lockExpiresAt: row.lock_expires_at,
    reserveUnits: row.reserve_units ?? 1,
    isLegacy: !row.user_id,
  })));
});

router.delete("/reserves/:requestId", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { requestId } = req.params;
  const clinic = await repos.clinics.findIdNameByLockedRequest(requestId);
  if (!clinic) {
    sendError(req, res, 404, "Reserve not found.");
    return;
  }

  const now = new Date().toISOString();
  await repos.shadowingRequests.setLockExpired(requestId, now);
  await repos.clinics.clearLockByRequestId(requestId);
  await writeAuditLog(adminId, "reserve.unreserve", "shadowing_request", requestId, {
    clinicId: clinic.id,
    clinicName: clinic.name,
  });

  res.json({ ok: true });
});

router.get("/quality-flags", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.qualityFlags.listWithClinicNames();
  res.json(rows.map(mapQualityFlagRow));
});

router.post("/quality-flags", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { clinicId, clinic_id: clinicIdLegacy, flagType, flag_type: flagTypeLegacy, notes } = req.body ?? {};
  const targetClinicId = clinicId || clinicIdLegacy;
  const targetFlagType = flagType || flagTypeLegacy;
  if (!targetClinicId || !targetFlagType) {
    sendError(req, res, 400, "Clinic and flag type are required.");
    return;
  }

  const clinic = await repos.qualityFlags.clinicIdName(targetClinicId);
  if (!clinic) {
    sendError(req, res, 404, "Clinic not found.");
    return;
  }

  const id = randomUUID();
  await repos.qualityFlags.insert({
    id,
    clinic_id: targetClinicId,
    flag_type: targetFlagType,
    notes: notes ?? "",
    created_by_user_id: adminId
  });
  await writeAuditLog(adminId, "quality_flag.create", "clinic_quality_flag", id, {
    clinicId: targetClinicId,
    clinicName: clinic.name,
    flagType: targetFlagType,
  });
  res.status(201).json({ id });
});

router.put("/quality-flags/:id/resolve", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const result = await repos.qualityFlags.resolve(id, adminId, new Date().toISOString());
  if (!result.changes) {
    sendError(req, res, 404, "Flag not found.");
    return;
  }
  await writeAuditLog(adminId, "quality_flag.resolve", "clinic_quality_flag", id);
  res.json({ ok: true });
});

router.delete("/quality-flags/:id", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const result = await repos.qualityFlags.deleteById(id);
  if (!result.changes) {
    sendError(req, res, 404, "Flag not found.");
    return;
  }
  await writeAuditLog(adminId, "quality_flag.delete", "clinic_quality_flag", id);
  res.json({ ok: true });
});

router.post("/cleanup/expired-reserves", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const now = new Date().toISOString();
  const clinicsResult = await repos.shadowingRequests.unlockClinicsExpired(now);
  const requestsResult = await repos.shadowingRequests.deleteExpired(now);
  const result = {
    unlockedClinics: clinicsResult.changes ?? 0,
    deletedRequests: requestsResult.changes ?? 0,
  };
  await writeAuditLog(adminId, "cleanup.expired_reserves", "cleanup", null, result);
  res.json({ ok: true, ...result });
});

router.get("/cleanup/duplicates", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.duplicateClinicNames();
  res.json(rows.map((row) => ({
    normalizedName: row.normalized_name,
    count: row.count,
    clinicIds: row.clinic_ids ? row.clinic_ids.split("|") : [],
    clinicNames: row.clinic_names ? row.clinic_names.split("|") : [],
  })));
});

router.get("/cleanup/missing-contact", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.missingContactClinics();
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    shadowingStatus: row.shadowing_status,
  })));
});

router.get("/cleanup/stale-clinics", async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const rows = await repos.adminCleanup.staleClinics();
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastVerifiedAt: row.last_verified_at,
    shadowingStatus: row.shadowing_status,
  })));
});
  app.use("/api/admin", router);
}
