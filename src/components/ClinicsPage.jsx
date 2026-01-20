import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "../data/clinics.js";

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

export default function ClinicsPage({
  clinics,
  statusOptions,
  zipFilter,
  setZipFilter,
  statusFilter,
  setStatusFilter,
  milesFilter,
  setMilesFilter
}) {
  const [centerCoords, setCenterCoords] = useState(MAP_CENTER);
  const [centerLabel, setCenterLabel] = useState("UW Tacoma");
  const [centerError, setCenterError] = useState("");

  useEffect(() => {
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
  }, [zipFilter]);

  const filteredClinics = useMemo(() => {
    return clinics.filter((clinic) => {
      const matchesStatus =
        statusFilter === "all" || clinic.shadowingStatus === statusFilter;
      const matchesZip =
        zipFilter.trim() === "" ||
        String(clinic.zip ?? "").startsWith(zipFilter.trim());
      const matchesRadius =
        milesFilter === "all"
          ? true
          : distanceInMiles(centerCoords, clinic) <= Number(milesFilter);
      return matchesStatus && matchesZip && matchesRadius;
    });
  }, [clinics, statusFilter, zipFilter, milesFilter, centerCoords]);

  return (
    <div className="directory">
      <header className="directory__header">
        <div>
          <p className="eyebrow">Clinic directory</p>
          <h1>Search clinics</h1>
          <p className="muted">
            Filter clinics ZIP and status.
          </p>
        </div>
      </header>

      <div className="directory__filters card">
        <label>
          ZIP code
          <input
            value={zipFilter}
            onChange={(event) => setZipFilter(event.target.value)}
            placeholder="98402"
          />
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

      <div className="directory__list">
        {filteredClinics.map((clinic) => (
          <article key={clinic.id} className="card directory__card">
            <div>
              <h3>{clinic.name}</h3>
              <p className="muted">{clinic.address}</p>
              <p className="muted small">ZIP {clinic.zip || "Not listed"}</p>
            </div>
            <div className={`status-pill status-pill--${clinic.shadowingStatus}`}>
              {statusOptions.find(
                (option) => option.value === clinic.shadowingStatus
              )?.label ?? clinic.shadowingStatus}
            </div>
          </article>
        ))}
        {filteredClinics.length === 0 ? (
          <div className="card">
            <p>No clinics match your filters yet.</p>
            <p className="muted small">
              Try a different ZIP code or broaden the status filter.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
