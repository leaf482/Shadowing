import { Router } from "express";
import { randomUUID } from "crypto";

// --- Projects + Sessions ---

const mapProjectRow = (row) => ({
  id: row.id,
  name: row.name,
  clinicId: row.clinic_id ?? null,
  experienceType: row.experience_type ?? null,
  address: row.address ?? null,
  address2: row.address2 ?? null,
  city: row.city ?? null,
  stateProvince: row.state_province ?? null,
  country: row.country ?? null,
  zip: row.zip ?? null,
  supervisorFirstName: row.supervisor_first_name ?? null,
  supervisorLastName: row.supervisor_last_name ?? null,
  supervisorTitle: row.supervisor_title ?? null,
  supervisorPhone: row.supervisor_phone ?? null,
  supervisorEmail: row.supervisor_email ?? null,
  status: row.status ?? null,
  description: row.description ?? null,
  notes: row.notes ?? null,
  dateStart: row.date_start ?? null,
  createdAt: row.created_at,
});

const mapSessionRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  date: row.date ?? null,
  hours: row.hours,
  notes: row.notes ?? null,
  createdAt: row.created_at,
});

export { mapProjectRow, mapSessionRow };

export function registerProjectsRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
router.get("", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await repos.projects.listByUser(userId);
  const result = await Promise.all(
    rows.map(async (p) => {
      const sessions = await repos.projects.sessionsByProject(p.id);
      return { ...mapProjectRow(p), sessions: sessions.map(mapSessionRow) };
    })
  );
  res.json(result);
});

router.post("", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const {
    name,
    dateStart,
    clinicId,
    experienceType,
    address, address2, city, stateProvince, country, zip,
    supervisorFirstName, supervisorLastName, supervisorTitle,
    supervisorPhone, supervisorEmail,
    status, description, notes,
  } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: "Project name is required." });
    return;
  }
  if (!dateStart) {
    res.status(400).json({ error: "Project start date is required." });
    return;
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();
  await repos.projects.insert({
    id,
    user_id: userId,
    name,
    date_start: dateStart,
    clinic_id: clinicId ?? null,
    experience_type: experienceType ?? null,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    status: status ?? "",
    description: description ?? "",
    notes: notes ?? "",
    created_at
  });

  res.status(201).json({ id });
});

router.put("/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const project = await repos.projects.findOwnedId(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const {
    name,
    dateStart,
    clinicId,
    experienceType,
    address, address2, city, stateProvince, country, zip,
    supervisorFirstName, supervisorLastName, supervisorTitle,
    supervisorPhone, supervisorEmail,
    status, description, notes,
  } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: "Project name is required." });
    return;
  }
  if (!dateStart) {
    res.status(400).json({ error: "Project start date is required." });
    return;
  }

  const full = await repos.projects.findOwnedFull(id, userId);
  await repos.projects.update({
    ...full,
    name,
    date_start: dateStart,
    clinic_id: clinicId ?? null,
    experience_type: experienceType ?? null,
    address: address ?? "",
    address2: address2 ?? "",
    city: city ?? "",
    state_province: stateProvince ?? "",
    country: country ?? "",
    zip: zip ?? "",
    supervisor_first_name: supervisorFirstName ?? "",
    supervisor_last_name: supervisorLastName ?? "",
    supervisor_title: supervisorTitle ?? "",
    supervisor_phone: supervisorPhone ?? "",
    supervisor_email: supervisorEmail ?? "",
    status: status ?? "",
    description: description ?? "",
    notes: notes ?? ""
  });

  res.json({ ok: true });
});

router.post("/:id/sessions", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id: projectId } = req.params;

  const project = await repos.projects.findOwnedId(projectId, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const { date, hours, notes } = req.body ?? {};
  const hoursNum = Number(hours);
  if (Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "Valid hours are required." });
    return;
  }

  const id = randomUUID();
  await repos.placementSessions.insert({
    id,
    project_id: projectId,
    date: date ?? null,
    hours: hoursNum,
    notes: notes ?? "",
    created_at: new Date().toISOString()
  });

  res.status(201).json({ id });
});

router.get("/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;

  const project = await repos.projects.findOwnedFull(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const sessions = await repos.projects.sessionsByProject(id);

  res.json({ ...mapProjectRow(project), sessions: sessions.map(mapSessionRow) });
});

router.delete("/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const project = await repos.projects.findOwnedId(id, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await repos.projects.deleteCascade(id);
  res.json({ ok: true });
});

router.delete("/:id/sessions/:sessionId", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id: projectId, sessionId } = req.params;
  const project = await repos.projects.findOwnedId(projectId, userId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  await repos.placementSessions.delete(projectId, sessionId);
  res.json({ ok: true });
});
  app.use("/api/projects", router);
}
