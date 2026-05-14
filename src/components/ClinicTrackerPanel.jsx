import { useState, useEffect } from "react";
import { PRIMARY_SPECIALTIES } from "../data/specialties.js";
import { authFetch } from "../lib/auth.js";
import { formatApiErrorMessage } from "../lib/auth.js";
import ClinicForm from "./ClinicForm.jsx";

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

export default function ClinicTrackerPanel({ clinic, statusLabels, onRefreshClinics }) {
  const [hoursSummary, setHoursSummary] = useState(null);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [quickStatus, setQuickStatus] = useState("pending");
  const [quickNotes, setQuickNotes] = useState("");
  const [savingQuickUpdate, setSavingQuickUpdate] = useState(false);
  const [quickUpdateError, setQuickUpdateError] = useState("");
  const [quickUpdateSuccess, setQuickUpdateSuccess] = useState("");
  const [isEditingClinic, setIsEditingClinic] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageSuccess, setManageSuccess] = useState("");
  const [deletingClinic, setDeletingClinic] = useState(false);

  useEffect(() => {
    authFetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((projects) => {
        let shadowing = 0;
        let volunteering = 0;
        projects.forEach((p) => {
          const projectHours = p.sessions.reduce((sum, s) => sum + s.hours, 0);
          if (
            !p.experienceType ||
            p.experienceType === "dental_shadowing_in_person" ||
            p.experienceType === "dental_shadowing_virtual"
          ) {
            shadowing += projectHours;
          } else if (p.experienceType === "volunteer") {
            volunteering += projectHours;
          }
        });
        setHoursSummary({ shadowing, volunteering });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clinic) return;
    setQuickStatus(clinic.shadowingStatus || "pending");
    setQuickNotes(clinic.notes || "");
    setQuickUpdateError("");
    setQuickUpdateSuccess("");
    setIsEditingClinic(false);
    setManageError("");
    setManageSuccess("");
  }, [clinic]);

  /* ── Hours widget (shown in both states) ── */
  const HoursWidget = () => (
    <div className="card card--compact" style={{ marginTop: "0.85rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Your shadowing progress</p>
      <div className="hours-widget">
        <div className="hours-widget__row">
          <span className="hours-widget__label">Shadowing hours</span>
          <span className="hours-widget__value">
            {hoursSummary !== null ? hoursSummary.shadowing.toFixed(1) : "—"}
          </span>
        </div>
        <div className="hours-widget__row">
          <span className="hours-widget__label">Volunteering hours</span>
          <span className="hours-widget__value hours-widget__value--secondary">
            {hoursSummary !== null ? hoursSummary.volunteering.toFixed(1) : "—"}
          </span>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
        Split totals from your tracker entries
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
        {hoursSummary !== null && <HoursWidget />}
      </div>
    );
  }

  /* ── Clinic detail ── */
  const locked = isLocked(clinic);
  const statusClass =
    ["available", "mixed"].includes(clinic.shadowingStatus) && locked ? "locked" : clinic.shadowingStatus;
  const statusLabel =
    ["available", "mixed"].includes(clinic.shadowingStatus) && locked
      ? `Temporarily unavailable until ${formatLockExpires(clinic.lockExpiresAt)}`
      : statusLabels[clinic.shadowingStatus] ?? clinic.shadowingStatus;

  const specialtyLabel =
    PRIMARY_SPECIALTIES.find((s) => s.value === clinic.primarySpecialty)?.label
    ?? clinic.primarySpecialty;
  const availableForRequest = ["available", "mixed"].includes(clinic.shadowingStatus) && !locked;
  const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

  const handleReserveSlot = async () => {
    setRequestError("");
    setRequestSuccess("");
    setLoadingRequest(true);
    try {
      const res = await authFetch(`/api/clinics/${clinic.id}/request`, {
        method: "POST"
      });
      if (res.ok) {
        setRequestSuccess("Reserved. This clinic is temporarily unavailable for about 2 weeks.");
        onRefreshClinics?.();
      } else {
        setRequestError(await formatApiErrorMessage(res, "Request failed."));
      }
    } catch {
      setRequestError("Network error. Please try again.");
    } finally {
      setLoadingRequest(false);
    }
  };

  const handleQuickUpdate = async () => {
    if (!clinic) return;
    setQuickUpdateError("");
    setQuickUpdateSuccess("");
    setSavingQuickUpdate(true);
    try {
      const response = await authFetch(`/api/clinics/${clinic.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone ?? "",
          email: clinic.email ?? "",
          lat: clinic.lat,
          lng: clinic.lng,
          zip: clinic.zip ?? "",
          shadowingStatus: quickStatus,
          primarySpecialty: clinic.primarySpecialty ?? "gp",
          secondaryFilters: Array.isArray(clinic.secondaryFilters) ? clinic.secondaryFilters : [],
          notes: quickNotes.trim(),
        })
      });

      if (response.ok) {
        setQuickUpdateSuccess("Clinic updated.");
        onRefreshClinics?.();
      } else {
        setQuickUpdateError(await formatApiErrorMessage(response, "Could not update clinic."));
      }
    } catch {
      setQuickUpdateError("Network error. Please try again.");
    } finally {
      setSavingQuickUpdate(false);
    }
  };

  const handleManageClinicSubmit = async (payload) => {
    if (!clinic) return;
    setManageError("");
    setManageSuccess("");
    try {
      const response = await authFetch(`/api/clinics/${clinic.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload.proposed)
      });

      if (response.ok) {
        setManageSuccess("Clinic updated.");
        setIsEditingClinic(false);
        onRefreshClinics?.();
      } else {
        setManageError(await formatApiErrorMessage(response, "Could not update clinic."));
      }
    } catch {
      setManageError("Network error. Please try again.");
    }
  };

  const handleDeleteClinic = async () => {
    if (!clinic) return;
    if (!confirm(`Delete ${clinic.name}? This cannot be undone.`)) return;
    setManageError("");
    setManageSuccess("");
    setDeletingClinic(true);
    try {
      const response = await authFetch(`/api/clinics/${clinic.id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        onRefreshClinics?.();
      } else {
        setManageError(await formatApiErrorMessage(response, "Could not delete clinic."));
      }
    } catch {
      setManageError("Network error. Please try again.");
    } finally {
      setDeletingClinic(false);
    }
  };

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

        {availableForRequest && (
          <div className="clinic-info__actions">
            <button
              type="button"
              className="button button--primary button--small"
              disabled={loadingRequest}
              onClick={handleReserveSlot}
            >
              {loadingRequest ? "…" : "Reserve slot"}
            </button>
          </div>
        )}
        {requestSuccess && (
          <p className="muted small" style={{ marginTop: "0.5rem", marginBottom: 0, color: "var(--success)" }}>
            {requestSuccess}
          </p>
        )}
        {requestError && (
          <p className="muted small" style={{ marginTop: "0.5rem", marginBottom: 0, color: "var(--danger)" }}>
            {requestError}
          </p>
        )}

        {clinic.canManage && (
          <div className="clinic-info__actions" style={{ marginTop: "0.65rem" }}>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => {
                setIsEditingClinic((current) => !current);
                setManageError("");
                setManageSuccess("");
              }}
            >
              {isEditingClinic ? "Close edit" : "Edit clinic"}
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              disabled={deletingClinic}
              onClick={handleDeleteClinic}
            >
              {deletingClinic ? "Deleting…" : "Delete clinic"}
            </button>
          </div>
        )}
        {manageSuccess && (
          <p className="muted small" style={{ marginTop: "0.5rem", marginBottom: 0, color: "var(--success)" }}>
            {manageSuccess}
          </p>
        )}
        {manageError && (
          <p className="muted small" style={{ marginTop: "0.5rem", marginBottom: 0, color: "var(--danger)" }}>
            {manageError}
          </p>
        )}

        {clinic.canManage && isEditingClinic && (
          <div className="clinic-info__notes-block" style={{ marginTop: "0.8rem", paddingTop: "0.8rem" }}>
            <p className="clinic-info__field-label" style={{ marginBottom: "0.45rem" }}>
              Edit clinic information
            </p>
            <ClinicForm
              clinics={[]}
              statusOptions={statusOptions}
              onSubmit={handleManageClinicSubmit}
              centerFallback={null}
              initialClinic={clinic}
              submitLabel="Save changes"
              onCancel={() => setIsEditingClinic(false)}
            />
          </div>
        )}

        {clinic.canManage && clinic.shadowingStatus === "pending" && (
          <div className="clinic-info__notes-block" style={{ marginTop: "0.8rem", paddingTop: "0.8rem" }}>
            <p className="clinic-info__field-label" style={{ marginBottom: "0.45rem" }}>
              Quick update (pending)
            </p>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`button button--small ${quickStatus === "available" ? "button--primary" : "button--secondary"}`}
                onClick={() => setQuickStatus("available")}
              >
                Available
              </button>
              <button
                type="button"
                className={`button button--small ${quickStatus === "unavailable" ? "button--primary" : "button--secondary"}`}
                onClick={() => setQuickStatus("unavailable")}
              >
                Not available
              </button>
            </div>
            <label style={{ marginTop: "0.6rem" }}>
              Notes / description
              <textarea
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                rows={3}
                placeholder="Update quick notes for this clinic"
              />
            </label>
            <div style={{ marginTop: "0.55rem" }}>
              <button
                type="button"
                className="button button--primary button--small"
                onClick={handleQuickUpdate}
                disabled={savingQuickUpdate}
              >
                {savingQuickUpdate ? "Saving…" : "Save update"}
              </button>
            </div>
            {quickUpdateSuccess && (
              <p className="muted small" style={{ marginTop: "0.45rem", marginBottom: 0, color: "var(--success)" }}>
                {quickUpdateSuccess}
              </p>
            )}
            {quickUpdateError && (
              <p className="muted small" style={{ marginTop: "0.45rem", marginBottom: 0, color: "var(--danger)" }}>
                {quickUpdateError}
              </p>
            )}
          </div>
        )}

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

      {hoursSummary !== null && <HoursWidget />}
    </div>
  );
}
