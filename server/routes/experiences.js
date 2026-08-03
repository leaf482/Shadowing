import { Router } from "express";
import { randomUUID } from "crypto";

// --- Experiences (Dental Shadowing Tracker) ---

const mapExperienceRow = (row) => ({
  id: row.id,
  experienceType: row.experience_type,
  organizationName: row.organization_name,
  address: row.address,
  address2: row.address2,
  city: row.city,
  stateProvince: row.state_province,
  country: row.country,
  zip: row.zip,
  supervisorFirstName: row.supervisor_first_name,
  supervisorLastName: row.supervisor_last_name,
  supervisorTitle: row.supervisor_title,
  supervisorPhone: row.supervisor_phone,
  supervisorEmail: row.supervisor_email,
  hours: row.hours,
  dateStart: row.date_start,
  dateEnd: row.date_end,
  notes: row.notes,
  description: row.description,
  avgWeeklyHours: row.avg_weekly_hours,
  numberOfWeeks: row.number_of_weeks,
  currentExperience: !!row.current_experience,
  status: row.status,
  title: row.title,
  typeCompensated: !!row.type_compensated,
  typeAcademicCredit: !!row.type_academic_credit,
  typeVolunteer: !!row.type_volunteer,
  createdAt: row.created_at,
});

export function registerExperiencesRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
router.get("", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { clinic, supervisor, phone, email, type } = req.query;
  const rows = await repos.experiences.listFiltered(userId, {
    clinic,
    supervisor,
    phone,
    email,
    type
  });
  res.json(rows.map(mapExperienceRow));
});

router.post("", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body ?? {};
  const {
    experienceType,
    organizationName,
    address,
    address2,
    city,
    stateProvince,
    country,
    zip,
    supervisorFirstName,
    supervisorLastName,
    supervisorTitle,
    supervisorPhone,
    supervisorEmail,
    hours,
    dateStart,
    dateEnd,
    notes,
    description,
    avgWeeklyHours,
    numberOfWeeks,
    currentExperience,
    status,
    title,
    typeCompensated,
    typeAcademicCredit,
    typeVolunteer,
  } = body;

  const hoursNum = Number(hours);
  if (!organizationName || Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "Organization name and valid hours are required." });
    return;
  }

  const id = randomUUID();
  const created_at = new Date().toISOString();
  await repos.experiences.insert({
    id,
    user_id: userId,
    experience_type: experienceType ?? "dental_shadowing_in_person",
    organization_name: organizationName,
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
    hours: hoursNum,
    date_start: dateStart ?? "",
    date_end: dateEnd ?? "",
    notes: notes ?? "",
    description: description ?? "",
    avg_weekly_hours: avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
    number_of_weeks: numberOfWeeks != null ? Number(numberOfWeeks) : null,
    current_experience: currentExperience ? 1 : 0,
    status: status ?? "",
    title: title ?? "",
    type_compensated: typeCompensated ? 1 : 0,
    type_academic_credit: typeAcademicCredit ? 1 : 0,
    type_volunteer: typeVolunteer ? 1 : 0,
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
  const body = req.body ?? {};
  const {
    experienceType,
    organizationName,
    address,
    address2,
    city,
    stateProvince,
    country,
    zip,
    supervisorFirstName,
    supervisorLastName,
    supervisorTitle,
    supervisorPhone,
    supervisorEmail,
    hours,
    dateStart,
    dateEnd,
    notes,
    description,
    avgWeeklyHours,
    numberOfWeeks,
    currentExperience,
    status,
    title,
    typeCompensated,
    typeAcademicCredit,
    typeVolunteer,
  } = body;

  const hoursNum = Number(hours);
  if (!id || !organizationName || Number.isNaN(hoursNum) || hoursNum < 0) {
    res.status(400).json({ error: "ID, organization name and valid hours are required." });
    return;
  }

  const result = await repos.experiences.update({
    id,
    user_id: userId,
    experience_type: experienceType ?? "dental_shadowing_in_person",
    organization_name: organizationName,
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
    hours: hoursNum,
    date_start: dateStart ?? "",
    date_end: dateEnd ?? "",
    notes: notes ?? "",
    description: description ?? "",
    avg_weekly_hours: avgWeeklyHours != null ? Number(avgWeeklyHours) : null,
    number_of_weeks: numberOfWeeks != null ? Number(numberOfWeeks) : null,
    current_experience: currentExperience ? 1 : 0,
    status: status ?? "",
    title: title ?? "",
    type_compensated: typeCompensated ? 1 : 0,
    type_academic_credit: typeAcademicCredit ? 1 : 0,
    type_volunteer: typeVolunteer ? 1 : 0
  });

  if (!result.changes) {
    res.status(404).json({ error: "Experience not found or not owned by this user." });
    return;
  }

  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "ID required." });
    return;
  }
  const result = await repos.experiences.delete(id, userId);
  if (!result.changes) {
    res.status(404).json({ error: "Experience not found or not owned by this user." });
    return;
  }
  res.json({ ok: true });
});
  app.use("/api/experiences", router);
}
