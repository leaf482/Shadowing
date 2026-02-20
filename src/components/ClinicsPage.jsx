import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "../data/clinics.js";
import { PRIMARY_SPECIALTIES } from "../data/specialties.js";

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
  return clinic?.shadowingStatus === "available" && !isLocked(clinic);
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
    let filtered = clinics.filter((clinic) => {
      const matchesSpecialty =
        specialtyFilter === "all" || clinic.primarySpecialty === specialtyFilter;
      const matchesSecondary =
        secondaryFilter === "all" ||
        (clinic.secondaryFilters || []).includes(secondaryFilter);
      const matchesStatus =
        statusFilter === "all" || clinic.shadowingStatus === statusFilter;
      const matchesZip =
        zipFilter.trim() === "" ||
        String(clinic.zip ?? "").startsWith(zipFilter.trim());
      const matchesRadius =
        milesFilter === "all"
          ? true
          : distanceInMiles(centerCoords, clinic) <= Number(milesFilter);
      return (
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
      const res = await fetch(`/api/clinics/${clinic.id}/request`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRequestSuccess({ clinic: data.clinic, lockExpiresAt: data.lockExpiresAt });
        onRefreshClinics?.();
      } else if (res.status === 409) {
        setRequestError(data.error || "This clinic is temporarily unavailable.");
      } else {
        setRequestError(data.error || "Request failed.");
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
      <header className="directory__header">
        <div>
          <p className="eyebrow">Clinic directory</p>
          <h1>Search clinics</h1>
          <p className="muted">
            Browse by primary specialty, then filter by ZIP and status.
          </p>
        </div>
      </header>

      <div className="directory__filters card">
        <label>
          Primary specialty
          <select
            value={specialtyFilter}
            onChange={(event) => setSpecialtyFilter(event.target.value)}
          >
            {specialtyFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {specialtyFilter !== "all" && secondaryFilterOptions ? (
          <label>
            Secondary filter
            <select
              value={secondaryFilter}
              onChange={(e) => setSecondaryFilter(e.target.value)}
            >
              <option value="all">선택안함</option>
              {secondaryFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          ZIP code
          <div className="inline-input">
            <input
              value={zipFilter}
              onChange={(event) => {
                setZipFilter(event.target.value);
                setUseNearby(false);
              }}
              placeholder="98402"
              disabled={useNearby}
            />
            <button
              type="button"
              className={`button button--small ${useNearby ? "button--primary" : "button--secondary"}`}
              onClick={() => {
                if (!useNearby) {
                  setUseNearby(true);
                  setZipFilter("");
                } else {
                  setUseNearby(false);
                }
              }}
              disabled={locationLoading}
            >
              {locationLoading ? "Locating…" : useNearby ? "Using location" : "Nearby You"}
            </button>
          </div>
          {locationError ? (
            <p className="muted small" style={{ color: "#b91c1c", marginTop: "0.25rem" }}>
              {locationError}
            </p>
          ) : null}
        </label>
        <label>
          Shadowing status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Radius (miles)
          <select
            value={milesFilter}
            onChange={(event) => setMilesFilter(event.target.value)}
          >
            <option value="all">Any distance</option>
            {MILES_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} miles
              </option>
            ))}
          </select>
        </label>
        <div className="directory__summary">
          <p className="label">Results</p>
          <p>{filteredClinics.length} clinics</p>
          <p className="muted small">Center: {centerLabel}</p>
        </div>
      </div>
      {centerError ? <p className="muted small">{centerError}</p> : null}
      {requestError ? (
        <div className="card card--compact request-error" role="alert">
          <p>{requestError}</p>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setRequestError("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="directory__list">
        {filteredClinics.map((clinic) => {
          const locked = isLocked(clinic);
          const availableForRequest = isAvailableForRequest(clinic);
          const statusLabel =
            clinic.shadowingStatus === "available" && locked
              ? `Temporarily Unavailable (until ${formatLockExpires(clinic.lockExpiresAt)})`
              : statusOptions.find((o) => o.value === clinic.shadowingStatus)?.label ?? clinic.shadowingStatus;
          const statusClass =
            clinic.shadowingStatus === "available" && locked
              ? "status-pill--locked"
              : clinic.shadowingStatus;
          const specialtyLabel =
            PRIMARY_SPECIALTIES.find((s) => s.value === clinic.primarySpecialty)
              ?.label ?? clinic.primarySpecialty;
          return (
            <article key={clinic.id} className="card directory__card">
              <div>
                <h3>{clinic.name}</h3>
                <p className="muted small specialty-label">{specialtyLabel}</p>
                <p className="muted">{clinic.address}</p>
                <p className="muted small">ZIP {clinic.zip || "Not listed"}</p>
              </div>
              <div className="directory__card-status">
                <span className={`status-pill status-pill--${statusClass}`}>
                  {statusLabel}
                </span>
                {availableForRequest ? (
                  <button
                    type="button"
                    className="button button--primary button--small"
                    disabled={loadingRequestId === clinic.id}
                    onClick={() => handleReserveSlot(clinic)}
                  >
                    {loadingRequestId === clinic.id
                      ? "Reserving…"
                      : "Reserve slot"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {filteredClinics.length === 0 ? (
          <div className="card">
            <p>No clinics match your filters yet.</p>
            <p className="muted small">
              Try a different ZIP code or broaden the status filter.
            </p>
          </div>
        ) : null}
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
