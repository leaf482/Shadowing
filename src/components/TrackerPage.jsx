import { useEffect, useState, useMemo } from "react";
import ExperienceForm from "./ExperienceForm.jsx";
import ProjectForm from "./ProjectForm.jsx";
import SessionForm from "./SessionForm.jsx";
import { EXPERIENCE_TYPES } from "../data/experienceTypes.js";

const TYPE_LABELS = Object.fromEntries(
  EXPERIENCE_TYPES.map((t) => [t.value, t.label])
);

export default function TrackerPage() {
  const [experiences, setExperiences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [projects, setProjects] = useState([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const [filters, setFilters] = useState({
    clinic: "",
    supervisor: "",
    phone: "",
    email: "",
    type: "",
  });

  const refresh = async () => {
    setIsLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (filters.clinic) params.set("clinic", filters.clinic);
    if (filters.supervisor) params.set("supervisor", filters.supervisor);
    if (filters.phone) params.set("phone", filters.phone);
    if (filters.email) params.set("email", filters.email);
    if (filters.type) params.set("type", filters.type);

    try {
      const response = await fetch(`/api/experiences?${params}`);
      if (!response.ok) throw new Error("Failed to load experiences");
      const data = await response.json();
      setExperiences(data);
    } catch (err) {
      setLoadError("Could not load experiences.");
      setExperiences([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [filters.clinic, filters.supervisor, filters.phone, filters.email, filters.type]);

  useEffect(() => {
    loadProjects();
  }, []);

  const totals = useMemo(() => {
    const byType = {};
    const byClinic = {};
    let total = 0;

    experiences.forEach((e) => {
      total += e.hours;
      byType[e.experienceType] = (byType[e.experienceType] || 0) + e.hours;
      byClinic[e.organizationName] =
        (byClinic[e.organizationName] || 0) + e.hours;
    });

    return { total, byType, byClinic };
  }, [experiences]);

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

  const handleCreate = async (payload) => {
    const response = await fetch("/api/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await refresh();
      setShowForm(false);
    } else {
      const err = await response.json();
      setLoadError(err.error || "Could not save.");
    }
  };

  const handleUpdate = async (payload) => {
    if (!editingId) return;
    const response = await fetch(`/api/experiences/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await refresh();
      setEditingId(null);
    } else {
      const err = await response.json();
      setLoadError(err.error || "Could not update.");
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) setProjects(await res.json());
    } catch {}
  };

  const handleCreateProject = async (payload) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await loadProjects();
      setShowProjectForm(false);
    }
  };

  const handleAddSession = async (projectId, payload) => {
    const res = await fetch(`/api/projects/${projectId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) await loadProjects();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this experience?")) return;
    const response = await fetch(`/api/experiences/${id}`, { method: "DELETE" });
    if (response.ok) {
      await refresh();
      setEditingId(null);
    }
  };

  const editingExperience = editingId
    ? experiences.find((e) => e.id === editingId)
    : null;

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="tracker">
      <header className="topbar">
        <div>
          <p className="eyebrow">Dental Shadowing Tracker</p>
          <h1>Experience tracker</h1>
          <p className="muted">
            Log shadowing and volunteer hours. Filter by clinic, supervisor, and
            contact info.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
        >
          {showForm ? "Close form" : "+ Add experience"}
        </button>
      </header>

      {(showForm || editingExperience) && (
        <div className="card tracker__form-card">
          <ExperienceForm
            initialData={editingExperience}
            onSubmit={editingExperience ? handleUpdate : handleCreate}
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
          />
        </div>
      )}

      <div className="tracker__totals card">
        <h3>Total hours</h3>
        <p className="tracker__total-value">{totals.total.toFixed(1)}</p>
        <div className="tracker__breakdown">
          {Object.entries(totals.byType).map(([type, hrs]) => (
            <span key={type} className="tracker__breakdown-item">
              {TYPE_LABELS[type] || type}: {hrs.toFixed(1)}h
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Filters</h3>
        <div className="tracker__filters">
          <input
            placeholder="Clinic name"
            value={filters.clinic}
            onChange={(e) => updateFilter("clinic", e.target.value)}
          />
          <input
            placeholder="Supervisor name"
            value={filters.supervisor}
            onChange={(e) => updateFilter("supervisor", e.target.value)}
          />
          <input
            placeholder="Phone"
            value={filters.phone}
            onChange={(e) => updateFilter("phone", e.target.value)}
          />
          <input
            placeholder="Email"
            value={filters.email}
            onChange={(e) => updateFilter("email", e.target.value)}
          />
          <select
            value={filters.type}
            onChange={(e) => updateFilter("type", e.target.value)}
          >
            <option value="">All types</option>
            {EXPERIENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && <p className="muted small">{loadError}</p>}
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : experiences.length === 0 ? (
        <div className="card">
          <p className="muted">No experiences yet. Add one above.</p>
        </div>
      ) : (
        <>
          <div className="tracker__list card">
            <h3>All experiences ({experiences.length})</h3>
            <ul className="tracker__items">
              {experiences.map((e) => (
                <li key={e.id} className="tracker__item">
                  <div className="tracker__item-main">
                    <strong>{e.organizationName}</strong>
                    <span className="tracker__item-type">
                      {e.title || TYPE_LABELS[e.experienceType] || e.experienceType}
                    </span>
                    <span className="tracker__item-hours">{e.hours}h</span>
                  </div>
                  <div className="tracker__item-details muted small">
                    {e.supervisorFirstName || e.supervisorLastName
                      ? `Supervisor: ${e.supervisorFirstName} ${e.supervisorLastName}`.trim()
                      : null}
                    {e.supervisorPhone && ` • ${e.supervisorPhone}`}
                    {e.supervisorEmail && ` • ${e.supervisorEmail}`}
                  </div>
                  <div className="tracker__item-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingId(e.id);
                        setShowForm(false);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => handleDelete(e.id)}
                      style={{ color: "#dc2626" }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Tracking by clinic</h3>
            <p className="muted small">
              Copy notes and description to paste into your dental school application.
            </p>
            {Object.entries(totals.byClinic).map(([clinicName, hrs]) => {
              const clinicExperiences = experiences.filter(
                (e) => e.organizationName === clinicName
              );
              const descriptions = clinicExperiences
                .filter((e) => e.description || e.notes)
                .map((e) => {
                  const parts = [];
                  if (e.title) parts.push(`Title: ${e.title}`);
                  if (e.hours) parts.push(`Hours: ${e.hours}`);
                  if (e.description) parts.push(e.description);
                  if (e.notes) parts.push(`Notes: ${e.notes}`);
                  return parts.join("\n\n");
                })
                .join("\n\n---\n\n");
              const copyText =
                descriptions ||
                `No description or notes yet. Edit experiences to add key responsibilities and interactions.`;

              return (
                <div key={clinicName} className="tracker__clinic-group">
                  <div className="tracker__clinic-header">
                    <span className="tracker__clinic-name">{clinicName}</span>
                    <span className="tracker__clinic-hours">
                      {hrs.toFixed(1)}h total
                    </span>
                  </div>
                  {clinicExperiences.map((e) => (
                    <div key={e.id} className="tracker__item tracker__item--nested">
                      <div className="tracker__item-main">
                        <span>{e.title || TYPE_LABELS[e.experienceType]}</span>
                        <span className="tracker__item-hours">{e.hours}h</span>
                      </div>
                      {(e.description || e.notes) && (
                        <div className="tracker__copy-block">
                          <button
                            type="button"
                            className="tracker__copy-btn"
                            onClick={() =>
                              navigator.clipboard?.writeText(
                                [e.description, e.notes].filter(Boolean).join("\n\n")
                              )
                            }
                          >
                            Copy
                          </button>
                          <pre>{[e.description, e.notes].filter(Boolean).join("\n\n")}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {clinicExperiences.some((e) => e.description || e.notes) ? (
                    <div className="tracker__copy-block">
                      <button
                        type="button"
                        className="tracker__copy-btn"
                        onClick={() =>
                          navigator.clipboard?.writeText(copyText)
                        }
                      >
                        Copy all for {clinicName}
                      </button>
                      <pre>{copyText}</pre>
                    </div>
                  ) : (
                    <p className="muted small">
                      Add description and notes when editing to copy into your application.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="card">
        <div className="tracker__clinic-header">
          <h3>Projects</h3>
          <button
            className="primary-button"
            onClick={() => { setShowProjectForm((v) => !v); setActiveProjectId(null); }}
          >
            {showProjectForm ? "Close" : "+ Add project"}
          </button>
        </div>
        <p className="muted small">Create a project (clinic placement), then log individual sessions under it.</p>

        {projects.length > 0 && (
          <div className="tracker__breakdown" style={{ marginTop: "0.5rem" }}>
            <span className="tracker__breakdown-item">
              {projectTotals.total.toFixed(1)}h total
            </span>
            <span className="tracker__breakdown-item">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </span>
            <span className="tracker__breakdown-item">
              {projectTotals.sessionCount} session{projectTotals.sessionCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {showProjectForm && (
          <div style={{ marginTop: "1rem" }}>
            <ProjectForm
              onSubmit={handleCreateProject}
              onCancel={() => setShowProjectForm(false)}
            />
          </div>
        )}

        {projects.length === 0 ? (
          <p className="muted small" style={{ marginTop: "0.75rem" }}>No projects yet.</p>
        ) : (
          <ul className="tracker__items" style={{ marginTop: "0.75rem" }}>
            {projects.map((p) => {
              const totalHours = p.sessions.reduce((sum, s) => sum + s.hours, 0);
              const isActive = activeProjectId === p.id;
              return (
                <li key={p.id} className="tracker__item">
                  <div className="tracker__item-main">
                    <strong>{p.name}</strong>
                    <span className="tracker__item-type">{p.experienceType ?? ""}</span>
                    <span className="tracker__item-hours">{totalHours.toFixed(1)}h</span>
                  </div>
                  {(p.supervisorFirstName || p.supervisorLastName) && (
                    <div className="tracker__item-details muted small">
                      {`Supervisor: ${p.supervisorFirstName ?? ""} ${p.supervisorLastName ?? ""}`.trim()}
                      {p.supervisorPhone && ` • ${p.supervisorPhone}`}
                      {p.supervisorEmail && ` • ${p.supervisorEmail}`}
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
        )}
      </div>
    </div>
  );
}

