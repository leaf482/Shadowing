// AADSAS character limit for description field
const DESCRIPTION_MAX = 750;

/**
 * Transform an array of projects (each with an embedded sessions[])
 * into flat AADSAS-compatible records.
 *
 * Projects with zero sessions are skipped (no hours to report).
 *
 * @param {Array} projects - as returned by mapProjectRow + sessions embedded
 * @returns {Array} flat AADSAS records
 */
export function toAadsasRecords(projects) {
  const records = [];

  for (const project of projects) {
    const sessions = project.sessions ?? [];
    if (sessions.length === 0) continue;

    const totalHours = sessions.reduce((sum, s) => sum + (s.hours ?? 0), 0);

    const datedSessions = sessions.map((s) => s.date).filter(Boolean).sort();
    const startDate = datedSessions[0] ?? "";
    const endDate = datedSessions[datedSessions.length - 1] ?? "";

    const supervisorName = [project.supervisorFirstName, project.supervisorLastName]
      .filter(Boolean)
      .join(" ");

    records.push({
      experience_type: project.experienceType ?? "",
      organization_name: project.name ?? "",
      supervisor_name: supervisorName,
      supervisor_email: project.supervisorEmail ?? "",
      supervisor_phone: project.supervisorPhone ?? "",
      start_date: startDate,
      end_date: endDate,
      total_hours: totalHours,
      description: (project.description ?? "").slice(0, DESCRIPTION_MAX),
    });
  }

  return records;
}

/**
 * Serialize an array of flat objects to RFC 4180 CSV.
 * Returns an empty string if records is empty.
 *
 * @param {Array} records
 * @returns {string} CSV text
 */
export function toCsv(records) {
  if (records.length === 0) return "";

  const headers = Object.keys(records[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const rows = [
    headers.join(","),
    ...records.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  return rows.join("\r\n");
}
