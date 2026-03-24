import { useState, useEffect } from "react";
import { PRIMARY_SPECIALTIES } from "../data/specialties.js";
import { getStoredEmail } from "../lib/auth.js";

function isLocked(clinic) {
  if (!clinic?.lockExpiresAt) return false;
  return new Date(clinic.lockExpiresAt) > new Date();
}

function formatLockExpires(lockExpiresAt) {
  if (!lockExpiresAt) return "";
  return new Date(lockExpiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function ClinicTrackerPanel({ clinic, statusLabels }) {
  const [totalHours, setTotalHours] = useState(null);

  useEffect(() => {
    const email = getStoredEmail();
    if (!email) return;
    fetch("/api/projects", { headers: { "x-user-id": email } })
      .then((r) => (r.ok ? r.json() : []))
      .then((projects) => {
        let total = 0;
        projects.forEach((p) => p.sessions.forEach((s) => { total += s.hours; }));
        setTotalHours(total);
      })
      .catch(() => {});
  }, []);

  if (!clinic) {
    return (
      <div className="info-panel">
        <div className="card">
          <h2>Select a clinic</h2>
          <p className="muted">
            Click a pin on the map or choose a clinic from the directory to see
            full details.
          </p>
        </div>
        {totalHours !== null && (
          <div className="card card--compact">
            <p className="eyebrow">Shadowing tracker</p>
            <h3>Total hours</h3>
            <p className="tracker__total-value">{totalHours.toFixed(1)}</p>
            <p className="muted small">Across all your shadowing projects</p>
          </div>
        )}
      </div>
    );
  }

  const locked = isLocked(clinic);
  const statusClass =
    clinic.shadowingStatus === "available" && locked
      ? "status-pill--locked"
      : clinic.shadowingStatus;
  const statusLabel =
    clinic.shadowingStatus === "available" && locked
      ? `Temporarily Unavailable (until ${formatLockExpires(clinic.lockExpiresAt)})`
      : statusLabels[clinic.shadowingStatus];

  const specialtyLabel =
    PRIMARY_SPECIALTIES.find((s) => s.value === clinic.primarySpecialty)
      ?.label ?? clinic.primarySpecialty;

  return (
    <div className="info-panel">
      <div className="card">
        <div className="info-header">
          <div>
            <p className="eyebrow">Clinic tracker</p>
            <h2>{clinic.name}</h2>
            <p className="muted">{clinic.address}</p>
          </div>
          <span className={`status-pill status-pill--${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="info-grid">
          <div>
            <p className="label">Primary specialty</p>
            <p>{specialtyLabel}</p>
          </div>
          <div>
            <p className="label">Phone</p>
            <p>{clinic.phone || "Not provided"}</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p>{clinic.email ? <a href={`mailto:${clinic.email}`}>{clinic.email}</a> : "Not provided"}</p>
          </div>
          <div>
            <p className="label">Last verified</p>
            <p>{clinic.lastVerifiedAt}</p>
          </div>
        </div>

        <div className="info-block">
          <p className="label">Notes</p>
          <p>{clinic.notes || "No notes yet."}</p>
        </div>

      </div>

      <div className="card card--compact">
        <p className="eyebrow">Shadowing tracker</p>
        <h3>Total hours</h3>
        <p className="tracker__total-value">
          {totalHours !== null ? totalHours.toFixed(1) : "—"}
        </p>
        <p className="muted small">Across all your shadowing projects</p>
      </div>
    </div>
  );
}
