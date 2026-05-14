import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "../data/clinics.js";
import { PRIMARY_SPECIALTIES } from "../data/specialties.js";
import { authFetch, formatApiErrorMessage } from "../lib/auth.js";

const MILES_OPTIONS = [5, 10, 15, 25];

const toRadians = (value) => (value * Math.PI) / 180;

const distanceInMiles = (from, to) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
};

function isLocked(clinic) {
  if (!clinic?.lockExpiresAt) return false;
  return new Date(clinic.lockExpiresAt) > new Date();
}

function isAvailableForRequest(clinic) {
  return ["available", "mixed"].includes(clinic?.shadowingStatus) && !isLocked(clinic);
}

function formatLockExpires(lockExpiresAt) {
  if (!lockExpiresAt) return "";
  return new Date(lockExpiresAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default function ClinicsPage({
  clinics,
  statusOptions,
  specialtyFilterOptions,
  specialtyFilter,
  setSpecialtyFilter,
  secondaryFilterOptions,
  secondaryFilter,
  setSecondaryFilter,
  zipFilter,
  setZipFilter,
  statusFilter,
  setStatusFilter,
  milesFilter,
  setMilesFilter,
  onRefreshClinics
}) {
  const [centerCoords, setCenterCoords] = useState(MAP_CENTER);
  const [centerLabel, setCenterLabel] = useState("UW Tacoma");
  const [centerError, setCenterError] = useState("");
  const [useNearby, setUseNearby] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState(null);
  const [requestError, setRequestError] = useState("");
  const [loadingRequestId, setLoadingRequestId] = useState(null);
  const [nameFilter, setNameFilter] = useState("");

  useEffect(() => {
    if (useNearby) {
      if (!navigator.geolocation) {
        setLocationError("Geolocation is not supported by your browser.");
        setUseNearby(false);
        return;
      }
      setLocationLoading(true);
      setLocationError("");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCenterCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setCenterLabel("Your location");
          setCenterError("");
          setLocationLoading(false);
        },
        (error) => {
          setLocationError("Could not get your location. Please enable location access.");
          setUseNearby(false);
          setCenterCoords(MAP_CENTER);
          setCenterLabel("UW Tacoma");
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      return;
    }
  }, [useNearby]);

  useEffect(() => {
    if (useNearby) return;
    let isActive = true;
    const fetchZipCenter = async () => {
      const trimmed = zipFilter.trim();
      if (!trimmed) {
        setCenterCoords(MAP_CENTER);
        setCenterLabel("UW Tacoma");
        setCenterError("");
        return;
      }
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&postalcode=${encodeURIComponent(
            trimmed
          )}`
        );
        if (!response.ok) {
          throw new Error("ZIP lookup failed.");
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        if (!data.length) {
          setCenterError("ZIP code not found. Using UW Tacoma as center.");
          setCenterCoords(MAP_CENTER);
          setCenterLabel("UW Tacoma");
          return;
        }
        setCenterCoords({
          lat: Number(data[0].lat),
          lng: Number(data[0].lon)
        });
        setCenterLabel(`ZIP ${trimmed}`);
        setCenterError("");
      } catch (error) {
        if (!isActive) {
          return;
        }
        setCenterCoords(MAP_CENTER);
        setCenterLabel("UW Tacoma");
        setCenterError("Could not locate ZIP. Using UW Tacoma as center.");
      }
    };

    fetchZipCenter();
    return () => {
      isActive = false;
    };
  }, [zipFilter, useNearby]);

  const filteredClinics = useMemo(() => {
    const nameTerm = nameFilter.trim().toLowerCase();
    let filtered = clinics.filter((clinic) => {
      const matchesName =
        !nameTerm ||
        clinic.name.toLowerCase().includes(nameTerm) ||
        (clinic.address ?? "").toLowerCase().includes(nameTerm);
      const matchesSpecialty =
        specialtyFilter === "all" || clinic.primarySpecialty === specialtyFilter;
      const matchesSecondary =
        secondaryFilter === "all" ||
        (clinic.secondaryFilters || []).includes(secondaryFilter);
      const matchesStatus =
        statusFilter === "all" || clinic.shadowingStatus === statusFilter;
      const matchesZip =
        zipFilter.trim() === "" ||
        String(clinic.zip ?? "").includes(zipFilter.trim());
      const matchesRadius =
        milesFilter === "all"
          ? true
          : distanceInMiles(centerCoords, clinic) <= Number(milesFilter);
      return (
        matchesName &&
        matchesSpecialty &&
        matchesSecondary &&
        matchesStatus &&
        matchesZip &&
        matchesRadius
      );
    });

    if (useNearby && centerCoords) {
      filtered = [...filtered].sort((a, b) => {
        const distA = distanceInMiles(centerCoords, a);
        const distB = distanceInMiles(centerCoords, b);
        return distA - distB;
      });
    }

    return filtered;
  }, [
    clinics,
    nameFilter,
    specialtyFilter,
    secondaryFilter,
    statusFilter,
    zipFilter,
    milesFilter,
    centerCoords,
    useNearby
  ]);

  const handleReserveSlot = async (clinic) => {
    setRequestError("");
    setLoadingRequestId(clinic.id);
    try {
      const res = await authFetch(`/api/clinics/${clinic.id}/request`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRequestSuccess({ clinic: data.clinic, lockExpiresAt: data.lockExpiresAt });
        onRefreshClinics?.();
      } else {
        setRequestError(await formatApiErrorMessage(res, "Request failed."));
      }
    } catch {
      setRequestError("Network error. Please try again.");
    } finally {
      setLoadingRequestId(null);
    }
  };

  const closeContactModal = () => {
    setRequestSuccess(null);
    setRequestError("");
  };

  return (
    <div className="directory">
      {/* Page header */}
      <div className="topbar">
        <div className="page-header">
          <p className="eyebrow">Clinic directory · Pierce County</p>
          <h1>Search clinics</h1>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Browse dental clinics in Pierce County. Filter by specialty, location, and status.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem", flexShrink: 0 }}>
          <span className="results-count">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.6 }}>
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {filteredClinics.length} result{filteredClinics.length !== 1 ? "s" : ""}
          </span>
          {centerLabel !== "UW Tacoma" && (
            <span className="small muted">📍 {centerLabel}</span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="card card--compact">
        <div className="clinic-filters">
          <label>
            Search clinic
            <input
              type="search"
              placeholder="Clinic name or address…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </label>
          <label>
            Specialty
            <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
              {specialtyFilterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            ZIP / Radius
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                value={zipFilter}
                onChange={(e) => { setZipFilter(e.target.value); setUseNearby(false); }}
                placeholder="98402"
                disabled={useNearby}
                style={{ flex: 1, minWidth: 0 }}
              />
              <select
                value={milesFilter}
                onChange={(e) => setMilesFilter(e.target.value)}
                style={{ width: "auto", flexShrink: 0 }}
              >
                <option value="all">Any</option>
                {MILES_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}mi</option>
                ))}
              </select>
            </div>
            {locationError && (
              <p className="muted small" style={{ color: "var(--danger)", marginTop: "0.2rem" }}>{locationError}</p>
            )}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <button
              type="button"
              className={`button button--small ${useNearby ? "button--primary" : "button--secondary"}`}
              onClick={() => { if (!useNearby) { setUseNearby(true); setZipFilter(""); } else { setUseNearby(false); } }}
              disabled={locationLoading}
              style={{ width: "100%" }}
            >
              {locationLoading ? "Locating…" : useNearby ? "📍 Nearby" : "📍 Near me"}
            </button>
            {(nameFilter || specialtyFilter !== "all" || statusFilter !== "all" || zipFilter || milesFilter !== "all" || useNearby) && (
              <button
                type="button"
                className="clinic-filters__clear"
                onClick={() => {
                  setNameFilter("");
                  setSpecialtyFilter("all");
                  setStatusFilter("all");
                  setZipFilter("");
                  setMilesFilter("all");
                  setUseNearby(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Sub-filters row */}
        {(specialtyFilter !== "all" && secondaryFilterOptions || centerLabel !== "UW Tacoma") && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.65rem", paddingTop: "0.65rem", borderTop: "1px solid var(--border-light)", flexWrap: "wrap" }}>
            {specialtyFilter !== "all" && secondaryFilterOptions && (
              <>
                <span className="small muted">Sub-filter:</span>
                <select
                  value={secondaryFilter}
                  onChange={(e) => setSecondaryFilter(e.target.value)}
                  style={{ fontSize: "0.82rem", padding: "0.3rem 0.6rem", borderRadius: "999px" }}
                >
                  <option value="all">All</option>
                  {secondaryFilterOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}
            {centerLabel !== "UW Tacoma" && (
              <span className="small muted" style={{ marginLeft: "auto" }}>
                📍 Center: {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {centerError && <p className="muted small">{centerError}</p>}

      {/* Error banner */}
      {requestError && (
        <div className="card card--compact request-error" role="alert">
          <p style={{ margin: 0 }}>{requestError}</p>
          <button type="button" className="button button--secondary button--small" onClick={() => setRequestError("")}>Dismiss</button>
        </div>
      )}

      {/* Clinic table */}
      <div className="clinic-table">
        <div className="clinic-table__header">
          <span>Clinic</span>
          <span>Specialty</span>
          <span>Status</span>
          <span style={{ textAlign: "right" }}>Action</span>
        </div>

        {filteredClinics.length === 0 ? (
          <div className="clinic-empty">
            <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>No clinics match your filters</p>
            <p className="muted small" style={{ margin: 0 }}>Try a different ZIP code, specialty, or broaden the status filter.</p>
          </div>
        ) : (
          filteredClinics.map((clinic) => {
            const locked = isLocked(clinic);
            const availableForRequest = isAvailableForRequest(clinic);
            const statusLabel =
              ["available", "mixed"].includes(clinic.shadowingStatus) && locked
                ? `Temporarily unavailable until ${formatLockExpires(clinic.lockExpiresAt)}`
                : statusOptions.find((o) => o.value === clinic.shadowingStatus)?.label ?? clinic.shadowingStatus;
            const statusClass =
              ["available", "mixed"].includes(clinic.shadowingStatus) && locked ? "locked" : clinic.shadowingStatus;
            const specialtyLabel =
              PRIMARY_SPECIALTIES.find((s) => s.value === clinic.primarySpecialty)?.label ?? clinic.primarySpecialty;

            return (
              <div key={clinic.id} className="clinic-row">
                <div className="clinic-row__info">
                  <span className={`status-dot status-dot--${statusClass}`} style={{ marginTop: "5px" }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="clinic-row__name">{clinic.name}</div>
                    {clinic.address && (
                      <div className="clinic-row__addr">{clinic.address}{clinic.zip ? ` · ${clinic.zip}` : ""}</div>
                    )}
                  </div>
                </div>
                <div className="clinic-row__specialty">{specialtyLabel}</div>
                <div className="clinic-row__status">
                  <span className={`status-pill status-pill--${statusClass}`}>{statusLabel}</span>
                </div>
                <div className="clinic-row__action">
                  {availableForRequest ? (
                    <button
                      type="button"
                      className="button button--primary button--small"
                      disabled={loadingRequestId === clinic.id}
                      onClick={() => handleReserveSlot(clinic)}
                    >
                      {loadingRequestId === clinic.id ? "…" : "Reserve slot"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {requestSuccess ? (
        <div className="modal-overlay" role="dialog" aria-labelledby="contact-modal-title">
          <div className="card modal">
            <h2 id="contact-modal-title">Request sent — contact the clinic</h2>
            <p className="muted">
              This clinic is temporarily reserved. Use one of the options below to reach them.
            </p>
            <div className="info-grid">
              {requestSuccess.clinic.phone ? (
                <div>
                  <p className="label">Phone (call)</p>
                  <p>
                    <a href={`tel:${requestSuccess.clinic.phone}`}>
                      {requestSuccess.clinic.phone}
                    </a>
                  </p>
                </div>
              ) : null}
              {requestSuccess.clinic.email ? (
                <div>
                  <p className="label">Email</p>
                  <p>
                    <a href={`mailto:${requestSuccess.clinic.email}`}>
                      {requestSuccess.clinic.email}
                    </a>
                  </p>
                </div>
              ) : null}
              <div>
                <p className="label">Address</p>
                <p>{requestSuccess.clinic.address}</p>
              </div>
            </div>
            <p className="muted small">
              Unavailable to others until {formatLockExpires(requestSuccess.lockExpiresAt)}.
            </p>
            <button
              type="button"
              className="button button--primary"
              onClick={closeContactModal}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
