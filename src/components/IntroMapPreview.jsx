import { useEffect, useMemo, useState } from "react";
import introMapBasemap from "../assets/intro-map-central-tacoma.png";
import { MAP_CENTER } from "../data/clinics.js";
import { INTRO_MAP_BOUNDS } from "../data/introMapPreviewBounds.js";

const STATUS_COLORS = {
  available: "#34c759",
  mixed: "#ffcc00",
  unavailable: "#ff3b30",
  pending: "#007aff"
};

function markerFill(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.mixed;
}

function toPinPosition(lat, lng, bounds = INTRO_MAP_BOUNDS) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
  return {
    left: Math.min(90, Math.max(10, x)),
    top: Math.min(86, Math.max(14, y))
  };
}

const DEMO_CLINICS = [
  { id: "demo-a", name: "Open — preview pin", shadowingStatus: "available", lat: MAP_CENTER.lat + 0.02, lng: MAP_CENTER.lng - 0.04 },
  { id: "demo-b", name: "Mixed — preview pin", shadowingStatus: "mixed", lat: MAP_CENTER.lat - 0.01, lng: MAP_CENTER.lng + 0.02 },
  { id: "demo-c", name: "Unavailable — preview pin", shadowingStatus: "unavailable", lat: MAP_CENTER.lat + 0.035, lng: MAP_CENTER.lng + 0.05 },
  { id: "demo-d", name: "Pending — preview pin", shadowingStatus: "pending", lat: MAP_CENTER.lat - 0.03, lng: MAP_CENTER.lng - 0.06 },
  { id: "demo-e", name: "Open — preview pin", shadowingStatus: "available", lat: MAP_CENTER.lat + 0.015, lng: MAP_CENTER.lng + 0.07 }
];

/**
 * Central Tacoma preview: stitched OSM raster (`src/assets/intro-map-central-tacoma.png`, bundled by Vite)
 * + live pins from clinics.json. Regenerate image/bounds with `npm run generate:intro-map`.
 */
export default function IntroMapPreview() {
  const [clinics, setClinics] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/clinics.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setClinics(rows.slice(0, 18));
      })
      .catch(() => {
        if (!cancelled) setClinics([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pins = useMemo(() => {
    const rows = clinics.length ? clinics : DEMO_CLINICS;
    return rows.map((c) => ({
      ...c,
      ...toPinPosition(Number(c.lat), Number(c.lng))
    }));
  }, [clinics]);

  return (
    <div className="intro-map-preview intro-map-preview--photo">
      <img
        className="intro-map-preview__basemap"
        src={introMapBasemap}
        alt=""
        decoding="async"
        draggable={false}
      />
      <div className="intro-map-preview__pins">
        {pins.map((c) => (
          <span
            key={c.id}
            className="intro-map-preview__pin"
            style={{
              left: `${c.left}%`,
              top: `${c.top}%`,
              backgroundColor: markerFill(c.shadowingStatus)
            }}
            title={c.name}
          />
        ))}
      </div>
      <p className="intro-map-preview__attrib">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>
      </p>
    </div>
  );
}
