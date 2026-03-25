import { useState, useEffect } from "react";
import { PRIMARY_SPECIALTIES } from "../data/specialties.js";
import { getStoredToken } from "../lib/auth.js";

function isLocked(clinic) {
  if (!clinic?.lockExpiresAt) return false;
  return new Date(clinic.lockExpiresAt) > new Date();
}

function formatLockExpires(lockExpiresAt) {
  if (!lockExpiresAt) return "";
  return new Date(lockExpiresAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric"
  });
}

export default function ClinicTrackerPanel({ clinic, statusLabels }) {
  const [totalHours, setTotalHours] = useState(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetch("/api/projects", { headers: { "x-session-token": token } })
      .then((r) => (r.ok ? r.json() : []))
      .then((projects) => {
        let total = 0;
        projects.forEach((p) => p.sessions.forEach((s) => { total += s.hours; }));
        setTotalHours(total);
      })
      .catch(() => {});
  }, []);

  /* ── Hours widget (shown in both states) ── */
  const HoursWidget = () => (
    <div className="card card--compact" style={{ marginTop: "0.85rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Your shadowing progress</p>
      <div className="hours-widget">
        <span className="hours-widget__value">
          {totalHours !== null ? totalHours.toFixed(1) : "—"}
        </span>
        <span className="hours-widget__label">Total hours logged</span>
      </div>
      <p className="muted small" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
        Across all projects in your tracker
      </p>
    </div>
  );

  /* ── Empty state ── */
  if (!clinic) {
    return (
      <div className="info-panel">
        <div className="card">
          <div className="info-empty">
            <div className="info-empty__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="10" r="3"/>
                <path d="M12 2a8 8 0 00-8 8c0 5 8 12 8 12s8-7 8-12a8 8 0 00-8-8z"/>
              </svg>
            </div>
            <p className="info-empty__title">Select a clinic</p>
            <p className="info-empty__sub">
              Click a pin on the map to view full details, contact info, and status.
            </p>
          </div>
        </div>
        {totalHours !== null && <HoursWidget />}
      </div>
    );
  }

  /* ── Clinic detail ── */
  const locked = isLocked(clinic);
  const statusClass =
    clinic.shadowingStatus === "available" && locked ? "locked" : clinic.shadowingStatus;
  const statusLabel =
    clinic.shadowingStatus === "available" && locked
      ? `On hold until ${formatLockExpires(clinic.lockExpiresAt)}`
      : statusLabels[clinic.shadowingStatus] ?? clinic.shadowingStatus;

  const specialtyLabel =
    PRIMARY_SPECIALTIES.find((s) => s.value === clinic.primarySpecialty)?.label
    ?? clinic.primarySpecialty;

  return (
    <div className="info-panel">
      <div className="card">
        {/* Header */}
        <div className="clinic-info__header">
          <div style={{ minWidth: 0 }}>
            <h2 className="clinic-info__name">{clinic.name}</h2>
            {clinic.address && (
              <p className="clinic-info__addr">{clinic.address}</p>
            )}
          </div>
          <span className={`status-pill status-pill--${statusClass}`} style={{ flexShrink: 0 }}>
            {statusLabel}
          </span>
        </div>

        {/* Info grid */}
        <div className="clinic-info__grid">
          <div>
            <p className="clinic-info__field-label">Specialty</p>
            <p className="clinic-info__field-value">{specialtyLabel}</p>
          </div>
          <div>
            <p className="clinic-info__field-label">ZIP code</p>
            <p className="clinic-info__field-value">{clinic.zip || "—"}</p>
          </div>
          <div>
            <p className="clinic-info__field-label">Phone</p>
            <p className="clinic-info__field-value">
              {clinic.phone
                ? <a href={`tel:${clinic.phone}`}>{clinic.phone}</a>
                : <span style={{ color: "var(--text-3)" }}>Not provided</span>}
            </p>
          </div>
          <div>
            <p className="clinic-info__field-label">Email</p>
            <p className="clinic-info__field-value" style={{ wordBreak: "break-all" }}>
              {clinic.email
                ? <a href={`mailto:${clinic.email}`}>{clinic.email}</a>
                : <span style={{ color: "var(--text-3)" }}>Not provided</span>}
            </p>
          </div>
          {clinic.lastVerifiedAt && (
            <div style={{ gridColumn: "1 / -1" }}>
              <p className="clinic-info__field-label">Last verified</p>
              <p className="clinic-info__field-value">{clinic.lastVerifiedAt}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {clinic.notes && (
          <div className="clinic-info__notes-block">
            <p className="clinic-info__field-label" style={{ marginBottom: "0.3rem" }}>Notes</p>
            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, margin: 0, color: "var(--text-2)" }}>
              {clinic.notes}
            </p>
          </div>
        )}
      </div>

      {totalHours !== null && <HoursWidget />}
    </div>
  );
}
