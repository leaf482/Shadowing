import { Router } from "express";
import { randomUUID } from "crypto";
import { COOLDOWN_DAYS, MAX_ACTIVE_RESERVES } from "../lib/env.js";
import { canManageClinic } from "../lib/admin.js";
import { mapClinicRow } from "../lib/clinicMapper.js";
import { CLINICS_SNAPSHOT_PATH } from "../lib/clinicsSnapshot.js";

export function registerClinicsRoutes(app, deps) {
  const {
    repos,
    getUserIdFromToken,
    isAdminUser,
    writeAuditLog,
    refreshClinicsSnapshot,
  } = deps;

app.get("/clinics.json", (req, res, next) => {
  res.type("application/json");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.sendFile(CLINICS_SNAPSHOT_PATH, (err) => {
    if (err) next(err);
  });
});

  const router = Router();
router.get("/locks", async (req, res) => {
  const rows = await repos.clinics.selectLockColumns();
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Cache-Control", "public, max-age=15");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.json(
    rows.map((row) => ({
      id: row.id,
      lockExpiresAt: row.lock_expires_at ?? null,
      lockedByRequestId: row.locked_by_request_id ?? null
    }))
  );
});

router.get("/session-overlay", async (req, res) => {
  const viewerUserId = await getUserIdFromToken(req);
  res.setHeader("Cache-Control", "private, no-store");
  if (!viewerUserId) {
    res.json({ clinics: [] });
    return;
  }
  const rows = await repos.clinics.selectIdAndCreatedBy();
  res.json({
    clinics: rows.map((row) => ({
      id: row.id,
      ownedByCurrentUser: row.created_by_user_id === viewerUserId,
      canManage: canManageClinic(row, viewerUserId)
    }))
  });
});

router.get("", async (req, res) => {
  const viewerUserId = await getUserIdFromToken(req);
  const rows = await repos.clinics.selectAllOrdered();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(rows.map((row) => mapClinicRow(row, viewerUserId)));
});

router.post("", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    address,
    phone,
    email,
    lat,
    lng,
    zip,
    shadowingStatus,
    primarySpecialty,
    secondaryFilters,
    notes
  } = req.body ?? {};

  if (!name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const id = randomUUID();
  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  const secondaryFiltersJson = Array.isArray(secondaryFilters)
    ? JSON.stringify(secondaryFilters)
    : "[]";
  await repos.clinics.insert({
    id,
    name,
    address,
    phone: phone ?? "",
    email: email ?? "",
    lat,
    lng,
    zip: zip ?? "",
    shadowing_status: shadowingStatus ?? "mixed",
    primary_specialty: primarySpecialty ?? "gp",
    secondary_filters: secondaryFiltersJson,
    notes: notes ?? "",
    last_verified_at: lastVerifiedAt,
    created_by_user_id: requesterId,
    lock_expires_at: null,
    locked_by_request_id: null
  });

  await writeAuditLog(requesterId, "clinic.create", "clinic", id, { name });
  void refreshClinicsSnapshot();
  res.status(201).json({ id });
});

router.put("/:id", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const {
    name,
    address,
    phone,
    email,
    lat,
    lng,
    zip,
    shadowingStatus,
    primarySpecialty,
    secondaryFilters,
    notes
  } = req.body ?? {};

  if (!id || !name || !address || typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "Missing required clinic fields." });
    return;
  }

  const clinic = await repos.clinics.findById(id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }
  if (!canManageClinic(clinic, requesterId)) {
    res.status(403).json({ error: "You can only edit clinics you added." });
    return;
  }

  const lastVerifiedAt = new Date().toISOString().slice(0, 10);
  const secondaryFiltersJson = Array.isArray(secondaryFilters)
    ? JSON.stringify(secondaryFilters)
    : "[]";
  await repos.clinics.updateFull({
    ...clinic,
    name,
    address,
    phone: phone ?? "",
    email: email ?? "",
    lat,
    lng,
    zip: zip ?? "",
    shadowing_status: shadowingStatus ?? "mixed",
    primary_specialty: primarySpecialty ?? "gp",
    secondary_filters: secondaryFiltersJson,
    notes: notes ?? "",
    last_verified_at: lastVerifiedAt
  });

  await writeAuditLog(requesterId, "clinic.update", "clinic", id, { name });
  void refreshClinicsSnapshot();
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const clinic = await repos.clinics.findById(id);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }
  if (!canManageClinic(clinic, requesterId)) {
    res.status(403).json({ error: "You can only delete clinics you added." });
    return;
  }

  await repos.clinics.deleteById(id);
  await writeAuditLog(requesterId, "clinic.delete", "clinic", id, { name: clinic.name });
  void refreshClinicsSnapshot();
  res.json({ ok: true });
});

// Delete all clinics (and their shadowing_requests). Use with care.
router.delete("", async (req, res) => {
  const requesterId = await getUserIdFromToken(req);
  if (!requesterId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isAdminUser(requesterId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  const result = await repos.clinics.deleteAll();
  await writeAuditLog(requesterId, "clinic.delete_all", "clinic", null, { deleted: result.changes });
  void refreshClinicsSnapshot();
  res.json({ ok: true, deleted: result.changes });
});

// --- Shadowing request (first-come lock + cooldown) ---

router.post("/:id/request", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id: clinicId } = req.params;
  if (!clinicId) {
    res.status(400).json({ error: "Clinic ID required." });
    return;
  }

  const clinic = await repos.clinics.findById(clinicId);
  if (!clinic) {
    res.status(404).json({ error: "Clinic not found." });
    return;
  }

  const reservableStatuses = new Set(["available", "mixed"]);
  if (!reservableStatuses.has(clinic.shadowing_status)) {
    res.status(400).json({
      error: "This clinic is not available for shadowing requests."
    });
    return;
  }

  const now = new Date().toISOString();
  const activeReserveCount = await repos.shadowingRequests.countActiveForUser(userId, now);
  if (activeReserveCount >= MAX_ACTIVE_RESERVES) {
    res.status(429).json({
      error: `You already have ${MAX_ACTIVE_RESERVES} active reserves. Please wait until one expires before reserving another clinic.`,
      activeReserveCount,
      maxActiveReserves: MAX_ACTIVE_RESERVES
    });
    return;
  }

  const lockExpiresAt = clinic.lock_expires_at;
  if (lockExpiresAt && lockExpiresAt > now) {
    const untilDate = new Date(lockExpiresAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    res.status(409).json({
      error: `This clinic is temporarily unavailable until ${untilDate}.`,
      lockExpiresAt
    });
    return;
  }

  const requestId = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COOLDOWN_DAYS);
  const expiresAtIso = expiresAt.toISOString();

  const lockAcquired = await repos.clinics.tryAcquireLock(clinicId, expiresAtIso, requestId, now);
  if (!lockAcquired) {
    res.status(409).json({
      error: "This clinic was just reserved by someone else. Please try again shortly.",
      lockExpiresAt: clinic.lock_expires_at ?? null
    });
    return;
  }

  try {
    await repos.shadowingRequests.insert({
      id: requestId,
      clinic_id: clinicId,
      user_id: userId,
      lock_expires_at: expiresAtIso,
      reserve_units: 1,
      created_at: now
    });
  } catch (err) {
    await repos.clinics.clearLockByRequestId(requestId);
    throw err;
  }

  const updated = await repos.clinics.findById(clinicId);
  res.status(201).json({
    requestId,
    lockExpiresAt: expiresAtIso,
    clinic: mapClinicRow(updated)
  });
});
  app.use("/api/clinics", router);
}
