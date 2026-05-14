import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "../data/clinics.js";

const STATUS_COLORS = {
  available: "#34c759",
  mixed: "#ffcc00",
  unavailable: "#ff3b30",
  pending: "#007aff"
};

function markerFill(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.mixed;
}

/** Rough Tacoma-area bounds → pin positions inside the illustration (not geographic accuracy). */
const VIEW = {
  minLat: MAP_CENTER.lat - 0.085,
  maxLat: MAP_CENTER.lat + 0.065,
  minLng: MAP_CENTER.lng - 0.14,
  maxLng: MAP_CENTER.lng + 0.1
};

function toPinPosition(lat, lng) {
  const x = ((lng - VIEW.minLng) / (VIEW.maxLng - VIEW.minLng)) * 100;
  const y = ((VIEW.maxLat - lat) / (VIEW.maxLat - VIEW.minLat)) * 100;
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
 * Stylized “maps app” illustration for the intro — not real tiles; conveys pins-on-map only.
 * Loads in a small lazy chunk (no Leaflet).
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
    <div className="intro-map-preview intro-map-preview--concept">
      <svg
        className="intro-map-preview__art"
        viewBox="0 0 320 220"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id="intro-map-land" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7f5f2" />
            <stop offset="100%" stopColor="#ebe8e4" />
          </linearGradient>
          <filter id="intro-map-road-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.12" />
          </filter>
        </defs>

        <rect width="320" height="220" fill="url(#intro-map-land)" />

        {/* Water — soft Apple-like blue */}
        <path
          fill="#cfe8fa"
          opacity="0.92"
          d="M268 152c22 18 52 28 62 68H0V118c36-8 72 6 108 22 52 24 118 18 160 12z"
        />
        <ellipse cx="278" cy="175" rx="48" ry="28" fill="#d8eefc" opacity="0.65" />

        {/* Parks / green space */}
        <ellipse cx="72" cy="68" rx="56" ry="40" fill="#d5ead7" opacity="0.72" />
        <ellipse cx="210" cy="52" rx="38" ry="30" fill="#ddeedf" opacity="0.55" />

        {/* Roads (underlay shadow, then light stroke) */}
        <g opacity="0.22">
          <path
            d="M-10 125 C 90 118 150 132 320 118"
            stroke="#8e8e93"
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M155 -10 C 148 70 168 150 145 235"
            stroke="#8e8e93"
            strokeWidth="11"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M-10 175 C 120 155 220 195 330 168"
            stroke="#8e8e93"
            strokeWidth="9"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g filter="url(#intro-map-road-shadow)">
          <path
            d="M-10 125 C 90 118 150 132 320 118"
            stroke="#ffffff"
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M155 -10 C 148 70 168 150 145 235"
            stroke="#fafafa"
            strokeWidth="9"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M-10 175 C 120 155 220 195 330 168"
            stroke="#f6f6f6"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>

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
    </div>
  );
}
