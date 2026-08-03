import { Router } from "express";
import { toAadsasRecords, toCsv } from "../export.js";
import { mapProjectRow, mapSessionRow } from "./projects.js";

export function registerExportRoutes(app, deps) {
  const { repos, getUserIdFromToken } = deps;
  const router = Router();
// --- AADSAS Export ---

router.get("/aadsas", async (req, res) => {
  const userId = await getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await repos.projects.listByUser(userId);
  const projects = await Promise.all(
    rows.map(async (p) => {
      const sessions = await repos.projects.sessionsByProject(p.id);
      return { ...mapProjectRow(p), sessions: sessions.map(mapSessionRow) };
    })
  );

  const records = toAadsasRecords(projects);

  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="aadsas_export.csv"');
    res.send(toCsv(records));
    return;
  }

  res.json(records);
});
  app.use("/api/export", router);
}
