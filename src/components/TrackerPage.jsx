import { useEffect, useState, useMemo } from "react";
import ProjectForm from "./ProjectForm.jsx";
import SessionForm from "./SessionForm.jsx";
import ExperienceForm from "./ExperienceForm.jsx";
import { authFetch, formatApiErrorMessage } from "../lib/auth.js";

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
  const [editingProject, setEditingProject] = useState(null);
  const [expandedExpId, setExpandedExpId] = useState(null);
  const [editingExp, setEditingExp] = useState(null); // experience object being edited
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");

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

  const userHeaders = () => ({ "Content-Type": "application/json" });

  const loadProjects = async () => {
    try {
      const res = await authFetch("/api/projects");
      if (res.ok) {
        setProjects(await res.json());
      } else {
        setLoadError("Could not load tracker projects. Try refreshing the page.");
      }
    } catch {
      setLoadError("Could not load tracker projects. Try refreshing the page.");
    }
  };

  const loadExperiences = async () => {
    try {
      const res = await authFetch("/api/experiences");
      if (res.ok) {
        setExperiences(await res.json());
      } else {
        setLoadError("Could not load tracker data. Try refreshing the page.");
      }
    } catch {
      setLoadError("Could not load tracker data. Try refreshing the page.");
    }
  };

  const handleCreateProject = async (payload) => {
    setActionError("");
    const res = await authFetch("/api/projects", {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadProjects();
      setActiveForm(null);
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to create project. Please try again."));
    }
  };

  const handleUpdateProject = async (payload) => {
    if (!editingProject) return;
    setActionError("");
    const res = await authFetch(`/api/projects/${editingProject.id}`, {
      method: "PUT",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadProjects();
      setEditingProject(null);
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to update project. Please try again."));
    }
  };

  const handleSaveExperience = async (payload) => {
    setSaveError("");
    const res = await authFetch("/api/experiences", {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadExperiences();
      setActiveForm(null);
    } else {
      setSaveError(await formatApiErrorMessage(res, "Failed to save experience. Please try again."));
    }
  };

  const handleUpdateExperience = async (payload) => {
    if (!editingExp) return;
    setSaveError("");
    const res = await authFetch(`/api/experiences/${editingExp.id}`, {
      method: "PUT",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadExperiences();
      setEditingExp(null);
    } else {
      setSaveError(await formatApiErrorMessage(res, "Failed to update experience. Please try again."));
    }
  };

  const handleExportAadsas = async () => {
    setActionError("");
    const res = await authFetch("/api/export/aadsas?format=csv");
    if (!res.ok) {
      setActionError(await formatApiErrorMessage(res, "Failed to export AADSAS CSV."));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aadsas_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSession = async (projectId, payload) => {
    setActionError("");
    const res = await authFetch(`/api/projects/${projectId}/sessions`, {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadProjects();
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to add session. Please try again."));
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!confirm("Delete this project and all its sessions? This cannot be undone.")) return;
    setActionError("");
    const res = await authFetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) {
      await loadProjects();
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to delete project."));
    }
  };

  const handleDeleteSession = async (projectId, sessionId) => {
    if (!confirm("Delete this session?")) return;
    setActionError("");
    const res = await authFetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) {
      await loadProjects();
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to delete session."));
    }
  };

  const handleDeleteExperience = async (expId) => {
    if (!confirm("Delete this experience entry?")) return;
    setActionError("");
    const res = await authFetch(`/api/experiences/${expId}`, {
      method: "DELETE",
      headers: userHeaders(),
    });
    if (res.ok) {
      await loadExperiences();
    } else {
      setActionError(await formatApiErrorMessage(res, "Failed to delete experience."));
    }
  };

  const toggleActiveForm = (type) => {
    setActiveForm((prev) => (prev === type ? null : type));
    setActiveProjectId(null);
    setEditingProject(null);
    setEditingExp(null);
    setSaveError("");
    setActionError("");
  };

  const renderProjectList = (list) => {
    return (
      <ul className="tracker__items">
        {list.map((p) => {
          const totalHours = p.sessions.reduce((sum, s) => sum + s.hours, 0);
          const isActive = activeProjectId === p.id;
          return (
            <li key={p.id} className="tracker__item">
              <div className="tracker__item-main">
                <strong style={{ fontSize: "0.9rem" }}>{p.name}</strong>
                {p.dateStart && (
                  <span className="tracker__item-type">{p.dateStart}</span>
                )}
                <span className="tracker__item-hours">{totalHours.toFixed(1)}h</span>
              </div>
              {(p.supervisorFirstName || p.supervisorLastName) && (
                <div className="tracker__item-details muted small">
                  {[p.supervisorFirstName, p.supervisorLastName].filter(Boolean).join(" ")}
                  {p.supervisorPhone && ` · ${p.supervisorPhone}`}
                </div>
              )}
              <div className="tracker__item-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setActiveProjectId(isActive ? null : p.id)}
                >
                  {isActive
                    ? "▲ Hide"
                    : `▼ Sessions${p.sessions.length > 0 ? ` (${p.sessions.length})` : ""}`}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditingProject(p);
                    setActiveForm(null);
                    setEditingExp(null);
                    setSaveError("");
                    setActionError("");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button text-button--danger"
                  onClick={() => handleDeleteProject(p.id)}
                >
                  Delete
                </button>
              </div>

              {isActive && (
                <div style={{ marginTop: "0.5rem" }}>
                  {p.sessions.length === 0 ? (
                    <p className="muted small" style={{ padding: "0.5rem 0" }}>No sessions yet — add one below.</p>
                  ) : (
                    <ul className="session-list">
                      {p.sessions.map((s) => (
                        <li key={s.id} className="session-item">
                          <span className="session-item__date">{s.date || "—"}</span>
                          {s.notes && <span className="session-item__notes">{s.notes}</span>}
                          <span className="session-item__hours">{s.hours}h</span>
                          <button
                            type="button"
                            className="text-button text-button--danger"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => handleDeleteSession(p.id, s.id)}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                    <SessionForm
                      onSubmit={(payload) => handleAddSession(p.id, payload)}
                      onCancel={() => setActiveProjectId(null)}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const shadowingHours = shadowingProjects.reduce((s, p) => s + p.sessions.reduce((ss, se) => ss + se.hours, 0), 0);
  const volunteerHours = volunteerProjects.reduce((s, p) => s + p.sessions.reduce((ss, se) => ss + se.hours, 0), 0);

  return (
    <div className="tracker">
      {/* Page header */}
      <div className="topbar">
        <div className="page-header">
          <p className="eyebrow">Dental Shadowing Tracker</p>
          <h1>My tracker</h1>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Log shadowing sessions, volunteering, and AADSAS experiences for your dental school application.
          </p>
        </div>
        {(projects.length > 0 || experiences.length > 0) && (
          <button type="button" className="ghost-button" onClick={handleExportAadsas}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ opacity: 0.7 }}>
              <path d="M7 1v8M4 6l3 3 3-3M1 10v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
            Export AADSAS CSV
          </button>
        )}
      </div>

      {loadError && (
        <p className="muted small" style={{ color: "#dc2626", marginBottom: "0.85rem" }} role="alert">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="muted small" style={{ color: "#dc2626", marginBottom: "0.85rem" }} role="alert">
          {actionError}
        </p>
      )}

      {/* Stat cards */}
      <div className="stat-row">
        <div className="stat-card card">
          <p className="stat-card__value">{projectTotals.total.toFixed(1)}</p>
          <p className="stat-card__label">Total hours logged</p>
        </div>
        <div className="stat-card card">
          <p className="stat-card__value">{shadowingHours.toFixed(1)}</p>
          <p className="stat-card__label">Shadowing hours</p>
          <p className="stat-card__sub">{shadowingProjects.length} clinic{shadowingProjects.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="stat-card card">
          <p className="stat-card__value">{volunteerHours.toFixed(1)}</p>
          <p className="stat-card__label">Volunteer hours</p>
          <p className="stat-card__sub">{volunteerProjects.length} placement{volunteerProjects.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="stat-card card">
          <p className="stat-card__value">{experiences.length}</p>
          <p className="stat-card__label">AADSAS entries</p>
          <p className="stat-card__sub">{projectTotals.sessionCount} session{projectTotals.sessionCount !== 1 ? "s" : ""} total</p>
        </div>
      </div>

      {/* Three side-by-side add buttons */}
      <div className="tracker__add-actions">
        {/* Shadowing — Blue */}
        <button
          type="button"
          className={`tracker__add-btn tracker__add-btn--shadowing${activeForm === "shadowing" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("shadowing")}
        >
          <span className="tracker__add-icon">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
              <circle cx="11" cy="8" r="4" opacity="0.25"/>
              <path d="M4 20c0-3.866 3.134-7 7-7s7 3.134 7 7" opacity="0.25"/>
              <rect x="10" y="4" width="2" height="8" rx="1"/>
              <rect x="7" y="6.5" width="8" height="2" rx="1"/>
            </svg>
          </span>
          <span className="tracker__add-btn-text">
            <span className="tracker__add-btn-title">Add Shadowing</span>
            <span className="tracker__add-label">Log a dental shadowing clinic</span>
          </span>
        </button>

        {/* AADSAS — Purple */}
        <button
          type="button"
          className={`tracker__add-btn tracker__add-btn--aadsas${activeForm === "aadsas" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("aadsas")}
        >
          <span className="tracker__add-icon">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
              <rect x="4" y="2" width="14" height="18" rx="2" opacity="0.2"/>
              <rect x="4" y="2" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <rect x="7" y="7" width="8" height="1.5" rx="0.75"/>
              <rect x="7" y="10.5" width="8" height="1.5" rx="0.75"/>
              <rect x="7" y="14" width="5" height="1.5" rx="0.75"/>
            </svg>
          </span>
          <span className="tracker__add-btn-text">
            <span className="tracker__add-btn-title">Add AADSAS Entry</span>
            <span className="tracker__add-label">ADEA application format</span>
          </span>
        </button>

        {/* Volunteering — Green */}
        <button
          type="button"
          className={`tracker__add-btn tracker__add-btn--volunteering${activeForm === "volunteering" ? " is-active" : ""}`}
          onClick={() => toggleActiveForm("volunteering")}
        >
          <span className="tracker__add-icon">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
              <path d="M11 19s-8-5-8-10a5 5 0 0110 0 5 5 0 0110 0c0 5-8 10-8 10z"/>
            </svg>
          </span>
          <span className="tracker__add-btn-text">
            <span className="tracker__add-btn-title">Add Volunteering</span>
            <span className="tracker__add-label">Log a volunteer placement</span>
          </span>
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
          {saveError && (
            <p className="muted small" style={{ color: "#dc2626", marginBottom: "0.75rem" }} role="alert">
              {saveError}
            </p>
          )}
          <ExperienceForm
            onSubmit={handleSaveExperience}
            onCancel={() => { setActiveForm(null); setSaveError(""); }}
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

      {editingProject && (
        <div className="card">
          <ProjectForm
            formType={editingProject.experienceType === "volunteer" ? "volunteering" : "shadowing"}
            initialData={editingProject}
            submitLabel="Update project"
            onSubmit={handleUpdateProject}
            onCancel={() => setEditingProject(null)}
          />
        </div>
      )}

      {/* Edit existing AADSAS experience */}
      {editingExp && (
        <div className="card">
          {saveError && (
            <p className="muted small" style={{ color: "#dc2626", marginBottom: "0.75rem" }} role="alert">
              {saveError}
            </p>
          )}
          <ExperienceForm
            initialData={editingExp}
            onSubmit={handleUpdateExperience}
            onCancel={() => { setEditingExp(null); setSaveError(""); }}
          />
        </div>
      )}

      {/* Projects: shadowing + volunteering side by side */}
      <div className="tracker__section-grid">
        {/* Shadowing */}
        <div className="card tracker__section--shadowing">
          <div className="tracker__clinic-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span className="section-badge section-badge--shadowing">Shadowing</span>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Dental Projects</h3>
            </div>
            <span style={{
              fontWeight: 700, color: "#1d4ed8", fontSize: "0.9rem",
              background: "#dbeafe", padding: "0.2rem 0.65rem", borderRadius: "999px"
            }}>
              {shadowingHours.toFixed(1)}h
            </span>
          </div>
          <p className="muted small" style={{ marginBottom: "0.75rem" }}>
            Click a project to log sessions and view notes.
          </p>
          {shadowingProjects.length === 0 ? (
            <div className="tracker__empty">
              <div className="tracker__empty-icon tracker__empty-icon--shadowing">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                  <rect x="10" y="4" width="2" height="8" rx="1"/>
                  <rect x="7" y="6.5" width="8" height="2" rx="1"/>
                  <circle cx="11" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
              <p className="tracker__empty-title">No shadowing clinics yet</p>
              <p className="tracker__empty-sub">Click "Add Shadowing" above to log your first clinic</p>
            </div>
          ) : (
            renderProjectList(shadowingProjects)
          )}
        </div>

        {/* Volunteering */}
        <div className="card tracker__section--volunteering">
          <div className="tracker__clinic-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span className="section-badge section-badge--volunteering">Volunteer</span>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Community Service</h3>
            </div>
            <span style={{
              fontWeight: 700, color: "#047857", fontSize: "0.9rem",
              background: "#d1fae5", padding: "0.2rem 0.65rem", borderRadius: "999px"
            }}>
              {volunteerHours.toFixed(1)}h
            </span>
          </div>
          <p className="muted small" style={{ marginBottom: "0.75rem" }}>
            Click a project to log sessions and view notes.
          </p>
          {volunteerProjects.length === 0 ? (
            <div className="tracker__empty">
              <div className="tracker__empty-icon tracker__empty-icon--volunteering">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                  <path d="M11 19s-8-5-8-10a5 5 0 0110 0 5 5 0 0110 0c0 5-8 10-8 10z"/>
                </svg>
              </div>
              <p className="tracker__empty-title">No volunteer placements yet</p>
              <p className="tracker__empty-sub">Click "Add Volunteering" above to log your first placement</p>
            </div>
          ) : (
            renderProjectList(volunteerProjects)
          )}
        </div>
      </div>

      {/* AADSAS Experiences — full width, purple accent */}
      <div className="card tracker__section--aadsas">
        <div className="tracker__clinic-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className="section-badge section-badge--aadsas">AADSAS</span>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Application Entries</h3>
          </div>
          <span style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>
            {experiences.length} saved
          </span>
        </div>
        <p className="muted small" style={{ marginBottom: "0.75rem" }}>
          Long-form ADEA AADSAS entries ready to copy into your dental school application.
        </p>

        {experiences.length === 0 ? (
          <div className="tracker__empty">
            <div className="tracker__empty-icon tracker__empty-icon--aadsas">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                <rect x="4" y="2" width="14" height="18" rx="2" opacity="0.2"/>
                <rect x="4" y="2" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <rect x="7" y="7" width="8" height="1.5" rx="0.75"/>
                <rect x="7" y="10.5" width="8" height="1.5" rx="0.75"/>
                <rect x="7" y="14" width="5" height="1.5" rx="0.75"/>
              </svg>
            </div>
            <p className="tracker__empty-title">No AADSAS entries yet</p>
            <p className="tracker__empty-sub">Click "Add AADSAS Entry" above to create your first application entry</p>
          </div>
        ) : (
          <ul className="tracker__items" style={{ marginTop: "0.25rem" }}>
            {experiences.map((exp) => {
              const isExpanded = expandedExpId === exp.id;
              const typeLabel = EXPERIENCE_TYPE_LABELS[exp.experienceType] ?? exp.experienceType;
              const dateRange = [
                exp.dateStart,
                exp.dateEnd ? `→ ${exp.dateEnd}` : exp.currentExperience ? "→ Present" : ""
              ].filter(Boolean).join(" ");

              return (
                <li key={exp.id} className="tracker__exp-item">
                  <div className="tracker__exp-item-header">
                    <strong style={{ fontSize: "0.9rem" }}>{exp.organizationName}</strong>
                    <span style={{
                      fontSize: "0.72rem", fontWeight: 600,
                      background: "#ede9fe", color: "#6d28d9",
                      padding: "0.15rem 0.5rem", borderRadius: "999px"
                    }}>{typeLabel}</span>
                    <span className="tracker__exp-item-hours">{exp.hours}h</span>
                  </div>
                  {(exp.title || dateRange) && (
                    <div className="muted small" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      {exp.title && <span>{exp.title}</span>}
                      {dateRange && <span style={{ color: "var(--text-3)" }}>{dateRange}</span>}
                    </div>
                  )}
                  <div className="tracker__item-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setExpandedExpId(isExpanded ? null : exp.id)}
                    >
                      {isExpanded ? "▲ Collapse" : "▼ Details"}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      style={{ color: "#6d28d9" }}
                      onClick={() => {
                        setEditingExp(exp);
                        setActiveForm(null);
                        setSaveError("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button text-button--danger"
                      onClick={() => handleDeleteExperience(exp.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{
                      marginTop: "0.75rem",
                      padding: "0.85rem",
                      background: "#faf9ff",
                      borderRadius: "var(--r)",
                      display: "flex", flexDirection: "column", gap: "0.5rem"
                    }}>
                      {exp.address && (
                        <div className="muted small">
                          <span className="label" style={{ display: "inline" }}>Address: </span>
                          {[exp.address, exp.city, exp.stateProvince].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {(exp.supervisorFirstName || exp.supervisorLastName) && (
                        <div className="muted small">
                          <span className="label" style={{ display: "inline" }}>Supervisor: </span>
                          {[exp.supervisorFirstName, exp.supervisorLastName].filter(Boolean).join(" ")}
                          {exp.supervisorTitle && `, ${exp.supervisorTitle}`}
                          {exp.supervisorEmail && ` · ${exp.supervisorEmail}`}
                        </div>
                      )}
                      {exp.avgWeeklyHours != null && (
                        <div className="muted small">
                          {exp.avgWeeklyHours}h/week × {exp.numberOfWeeks} weeks = <strong>{exp.hours}h</strong>
                        </div>
                      )}
                      {exp.description && (
                        <div>
                          <p className="label" style={{ marginBottom: "0.2rem" }}>Description</p>
                          <p style={{ fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>{exp.description}</p>
                        </div>
                      )}
                      {exp.notes && (
                        <div>
                          <p className="label" style={{ marginBottom: "0.2rem" }}>Notes</p>
                          <p className="muted small" style={{ margin: 0 }}>{exp.notes}</p>
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
