import { useEffect, useState, useMemo } from "react";
import ExperienceForm from "./ExperienceForm.jsx";
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
      ) : (
        <div className="tracker__list card">
          <h3>Experiences ({experiences.length})</h3>
          {experiences.length === 0 ? (
            <p className="muted">No experiences yet. Add one above.</p>
          ) : (
            <ul className="tracker__items">
              {experiences.map((e) => (
                <li key={e.id} className="tracker__item">
                  <div className="tracker__item-main">
                    <strong>{e.organizationName}</strong>
                    <span className="tracker__item-type">
                      {TYPE_LABELS[e.experienceType] || e.experienceType}
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
          )}
        </div>
      )}
    </div>
  );
}
