import { useEffect, useState, useMemo } from "react";
import ProjectForm from "./ProjectForm.jsx";
import SessionForm from "./SessionForm.jsx";
import ExperienceForm from "./ExperienceForm.jsx";
import { getStoredEmail, getStoredToken } from "../lib/auth.js";

const EXPERIENCE_TYPE_LABELS = {
  dental_shadowing_in_person: "Dental Shadowing (In-Person)",
  dental_shadowing_virtual: "Dental Shadowing (Virtual)",
  volunteer: "Volunteer",
  employment: "Employment",
  research: "Research",
  other: "Other",
};

export default function TrackerPage() {
  const [projects, setProjects] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [activeForm, setActiveForm] = useState(null); // 'shadowing' | 'aadsas' | 'volunteering'
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [expandedExpId, setExpandedExpId] = useState(null);

  useEffect(() => {
    loadProjects();
    loadExperiences();
  }, []);

  const projectTotals = useMemo(() => {
    let total = 0;
    let sessionCount = 0;
    projects.forEach((p) => {
      p.sessions.forEach((s) => {
        total += s.hours;
        sessionCount++;
      });
    });
    return { total, sessionCount };
  }, [projects]);

  const shadowingProjects = useMemo(
    () => projects.filter((p) =>
      !p.experienceType ||
      p.experienceType === "dental_shadowing_in_person" ||
      p.experienceType === "dental_shadowing_virtual"
    ),
    [projects]
  );

  const volunteerProjects = useMemo(
    () => projects.filter((p) => p.experienceType === "volunteer"),
    [projects]
  );

  const userHeaders = () => {
    const token = getStoredToken();
    return token
      ? { "Content-Type": "application/json", "x-session-token": token }
      : { "Content-Type": "application/json" };
  };

  const loadProjects = async () => {
    try {
      const token = getStoredToken();
      const res = await fetch("/api/projects", {
        headers: token ? { "x-session-token": token } : {},
      });
      if (res.ok) setProjects(await res.json());
    } catch {}
  };

  const loadExperiences = async () => {
    try {
      const token = getStoredToken();
      const res = await fetch("/api/experiences", {
        headers: token ? { "x-session-token": token } : {},
      });
      if (res.ok) setExperiences(await res.json());
    } catch {}
  };

  const handleCreateProject = async (payload) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadProjects();
      setActiveForm(null);
    }
  };

  const handleSaveExperience = async (payload) => {
    const res = await fetch("/api/experiences", {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadExperiences();
      setActiveForm(null);
    }
  };

  const handleExportAadsas = async () => {
    const token = getStoredToken();
    const res = await fetch("/api/export/aadsas?format=csv", {
      headers: token ? { "x-session-token": token } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aadsas_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSession = async (projectId, payload) => {
    const res = await fetch(`/api/projects/${projectId}/sessions`, {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) await loadProjects();
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm("Delete this project and all its sessions? This cannot be undone.")) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) await loadProjects();
  };

  const handleDeleteSession = async (projectId, sessionId) => {
    if (!confirm("Delete this session?")) return;
    const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) await loadProjects();
  };

  const handleDeleteExperience = async (expId) => {
    if (!confirm("Delete this experience entry?")) return;
    const res = await fetch(`/api/experiences/${expId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) await loadExperiences();
  };

  const toggleActiveForm = (type) => {
    setActiveForm((prev) => (prev === type ? null : type));
    setActiveProjectId(null);
  };

  const renderProjectList = (list, emptyMsg) => {
    if (list.length === 0) {
      return <p className="muted small" style={{ marginTop: "0.5rem" }}>{emptyMsg}</p>;
    }
    return (
      <ul className="tracker__items" style={{ marginTop: "0.75rem" }}>
        {list.map((p) => {
          const totalHours = p.sessions.reduce((sum, s) => sum + s.hours, 0);
          const isActive = activeProjectId === p.id;
          return (
            <li key={p.id} className="tracker__item">
              <div className="tracker__item-main">
                <strong>{p.name}</strong>
                {p.dateStart && (
                  <span className="tracker__item-type">{p.dateStart}</span>
                )}
                <span className="tracker__item-hours">{totalHours.toFixed(1)}h</span>
              </div>
              {(p.supervisorFirstName || p.supervisorLastName) && (
                <div className="tracker__item-details muted small">
                  {`Supervisor: ${p.supervisorFirstName ?? ""} ${p.supervisorLastName ?? ""}`.trim()}
                  {p.supervisorPhone && ` · ${p.supervisorPhone}`}
                  {p.supervisorEmail && ` · ${p.supervisorEmail}`}
                </div>
              )}
              <div className="tracker__item-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setActiveProjectId(isActive ? null : p.id)}
                >
                  {isActive ? "Hide" : `Sessions (${p.sessions.length})`}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => handleDeleteProject(p.id)}
                  style={{ color: "#dc2626" }}
                >
                  Delete
                </button>
              </div>

              {isActive && (
                <div style={{ marginTop: "0.5rem" }}>
                  {p.sessions.length === 0 ? (
                    <p className="muted small">No sessions yet.</p>
                  ) : (
                    <ul className="tracker__items">
                      {p.sessions.map((s) => (
                        <li key={s.id} className="tracker__item tracker__item--nested">
                          <div className="tracker__item-main">
                            <span>{s.date || "No date"}</span>
                            <span className="tracker__item-hours">{s.hours}h</span>
                          </div>
                          {s.notes && <div className="muted small">{s.notes}</div>}
                          <div className="tracker__item-actions">
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => handleDeleteSession(p.id, s.id)}
                              style={{ color: "#dc2626" }}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <SessionForm
                    onSubmit={(payload) => handleAddSession(p.id, payload)}
                    onCancel={() => setActiveProjectId(null)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="tracker">
      <header className="topbar">
        <div>
          <p className="eyebrow">Dental Shadowing Tracker</p>
          <h1>My tracker</h1>
          <p className="muted">
            Log shadowing sessions, volunteering, and AADSAS experiences for your dental school application.
          </p>
        </div>
      </header>

      {/* Total hours summary */}
      <div className="tracker__totals card">
        <div className="tracker__clinic-header">
          <div>
            <p className="eyebrow">Overall summary</p>
            <h3>Total hours</h3>
          </div>
          {projects.length > 0 && (
            <button type="button" className="ghost-button" onClick={handleExportAadsas}>
              Export AADSAS CSV
            </button>
          )}
        </div>
        <p className="tracker__total-value">{projectTotals.total.toFixed(1)}</p>
        <div className="tracker__breakdown">
          <span className="tracker__breakdown-item">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <span className="tracker__breakdown-item">
            {projectTotals.sessionCount} session{projectTotals.sessionCount !== 1 ? "s" : ""}
          </span>
          <span className="tracker__breakdown-item">
            {experiences.length} AADSAS entr{experiences.length !== 1 ? "ies" : "y"}
          </span>
        </div>
      </div>

      {/* Three side-by-side add buttons */}
      <div className="tracker__add-actions">
        <button
          type="button"
          className={`tracker__add-btn${activeForm === "shadowing" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("shadowing")}
        >
          <span className="tracker__add-icon">+</span>
          Add Shadowing Experience
          <span className="tracker__add-label">Log a dental shadowing clinic</span>
        </button>
        <button
          type="button"
          className={`tracker__add-btn${activeForm === "aadsas" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("aadsas")}
        >
          <span className="tracker__add-icon">+</span>
          Add AADSAS Experience
          <span className="tracker__add-label">Full ADEA AADSAS format entry</span>
        </button>
        <button
          type="button"
          className={`tracker__add-btn${activeForm === "volunteering" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("volunteering")}
        >
          <span className="tracker__add-icon">+</span>
          Add Volunteering Experience
          <span className="tracker__add-label">Log a volunteer placement</span>
        </button>
      </div>

      {/* Active form */}
      {activeForm === "shadowing" && (
        <div className="card">
          <ProjectForm
            formType="shadowing"
            onSubmit={handleCreateProject}
            onCancel={() => setActiveForm(null)}
          />
        </div>
      )}
      {activeForm === "aadsas" && (
        <div className="card">
          <ExperienceForm
            onSubmit={handleSaveExperience}
            onCancel={() => setActiveForm(null)}
          />
        </div>
      )}
      {activeForm === "volunteering" && (
        <div className="card">
          <ProjectForm
            formType="volunteering"
            onSubmit={handleCreateProject}
            onCancel={() => setActiveForm(null)}
          />
        </div>
      )}

      {/* Projects: shadowing + volunteering side by side */}
      <div className="tracker__section-grid">
        <div className="card">
          <div className="tracker__clinic-header">
            <h3>Shadowing projects</h3>
            <span className="tracker__breakdown-item">
              {shadowingProjects.reduce((s, p) => s + p.sessions.reduce((ss, se) => ss + se.hours, 0), 0).toFixed(1)}h
            </span>
          </div>
          <p className="muted small">Click a project to log sessions and view reflections.</p>
          {renderProjectList(shadowingProjects, "No shadowing projects yet. Click \"Add Shadowing Experience\" above.")}
        </div>

        <div className="card">
          <div className="tracker__clinic-header">
            <h3>Volunteering projects</h3>
            <span className="tracker__breakdown-item">
              {volunteerProjects.reduce((s, p) => s + p.sessions.reduce((ss, se) => ss + se.hours, 0), 0).toFixed(1)}h
            </span>
          </div>
          <p className="muted small">Click a project to log sessions and view reflections.</p>
          {renderProjectList(volunteerProjects, "No volunteering projects yet. Click \"Add Volunteering Experience\" above.")}
        </div>
      </div>

      {/* AADSAS Experiences */}
      <div className="card">
        <div className="tracker__clinic-header">
          <h3>AADSAS experiences</h3>
          <span className="muted small">{experiences.length} saved</span>
        </div>
        <p className="muted small">Long-form ADEA AADSAS entries ready to copy into your application.</p>

        {experiences.length === 0 ? (
          <p className="muted small" style={{ marginTop: "0.75rem" }}>
            No AADSAS entries yet. Click "Add AADSAS Experience" above to create one.
          </p>
        ) : (
          <ul className="tracker__items" style={{ marginTop: "0.75rem" }}>
            {experiences.map((exp) => {
              const isExpanded = expandedExpId === exp.id;
              const typeLabel = EXPERIENCE_TYPE_LABELS[exp.experienceType] ?? exp.experienceType;
              return (
                <li key={exp.id} className="tracker__exp-item">
                  <div className="tracker__exp-item-header">
                    <strong>{exp.organizationName}</strong>
                    <span className="tracker__item-type">{typeLabel}</span>
                    <span className="tracker__exp-item-hours">{exp.hours}h</span>
                  </div>
                  {exp.title && <div className="muted small">{exp.title}</div>}
                  <div className="muted small">
                    {[exp.dateStart, exp.dateEnd ? `→ ${exp.dateEnd}` : exp.currentExperience ? "→ Present" : ""].filter(Boolean).join(" ")}
                  </div>
                  <div className="tracker__item-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setExpandedExpId(isExpanded ? null : exp.id)}
                    >
                      {isExpanded ? "Collapse" : "View details"}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => handleDeleteExperience(exp.id)}
                      style={{ color: "#dc2626" }}
                    >
                      Delete
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {exp.address && <div className="muted small">Address: {[exp.address, exp.city, exp.stateProvince].filter(Boolean).join(", ")}</div>}
                      {(exp.supervisorFirstName || exp.supervisorLastName) && (
                        <div className="muted small">
                          Supervisor: {[exp.supervisorFirstName, exp.supervisorLastName].filter(Boolean).join(" ")}
                          {exp.supervisorTitle && `, ${exp.supervisorTitle}`}
                          {exp.supervisorEmail && ` · ${exp.supervisorEmail}`}
                        </div>
                      )}
                      {exp.avgWeeklyHours != null && (
                        <div className="muted small">
                          {exp.avgWeeklyHours}h/week × {exp.numberOfWeeks} weeks = {exp.hours}h total
                        </div>
                      )}
                      {exp.description && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <p className="label">Description</p>
                          <p style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>{exp.description}</p>
                        </div>
                      )}
                      {exp.notes && (
                        <div>
                          <p className="label">Notes</p>
                          <p className="muted small">{exp.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
