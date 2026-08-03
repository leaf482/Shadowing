import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_ZOOM, MAP_CENTER } from "../data/clinics.js";
import {
  getStoredHomeZip,
  HOME_ZIP_CHANGED_EVENT
} from "../lib/welcomeGate.js";
import { isLocked } from "../lib/clinicLocks.js";

const STATUS_COLORS = {
  available: "#2ecc71",
  mixed: "#f1c40f",
  unavailable: "#e74c3c",
  pending: "#3b82f6",
  locked: "#94a3b8"
};

const ZIP_FRAME_ZOOM = 11;

function getMarkerColor(clinic) {
  if (clinic.shadowingStatus === "available" && isLocked(clinic)) {
    return STATUS_COLORS.locked;
  }
  return STATUS_COLORS[clinic.shadowingStatus] ?? STATUS_COLORS.mixed;
}

const flyToClinic = (map, clinic) => {
  map.setView([clinic.lat, clinic.lng], 13, { animate: true });
};

async function geocodeUsZip(zip) {
  const res = await fetch(
    `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`
  );
  if (!res.ok) throw new Error("zip_not_found");
  const data = await res.json();
  const p = data?.places?.[0];
  if (!p) throw new Error("zip_not_found");
  const lat = parseFloat(p.latitude);
  const lng = parseFloat(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("zip_not_found");
  }
  return { lat, lng };
}

/** Skip auto pan to the initially selected clinic once when framing from home ZIP. */
function MapController({ selectedClinic, deferInitialClinicFly }) {
  const map = useMap();
  const skippedInitialFlyRef = useRef(false);
  const lastFlownIdRef = useRef(null);

  useEffect(() => {
    if (!selectedClinic) return;
    const id = selectedClinic.id;

    if (deferInitialClinicFly && !skippedInitialFlyRef.current) {
      skippedInitialFlyRef.current = true;
      lastFlownIdRef.current = id;
      return;
    }

    if (lastFlownIdRef.current === id) return;
    lastFlownIdRef.current = id;
    flyToClinic(map, selectedClinic);
  }, [map, selectedClinic, deferInitialClinicFly]);

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

function ClinicMarkers({ clinics, selectedClinicId, onSelectClinic }) {
  const map = useMap();

  return (
    <>
      {clinics.map((clinic) => (
        <CircleMarker
          key={clinic.id}
          center={[clinic.lat, clinic.lng]}
          radius={clinic.id === selectedClinicId ? 10 : 7}
          pathOptions={{
            color: getMarkerColor(clinic),
            fillColor: getMarkerColor(clinic),
            fillOpacity: 0.85
          }}
          eventHandlers={{
            click: () => {
              flyToClinic(map, clinic);
              onSelectClinic(clinic.id);
            }
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            {clinic.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export default function MapPanel({
  clinics,
  selectedClinicId,
  onSelectClinic,
  userEmail
}) {
  const [zipRevision, setZipRevision] = useState(0);

  useEffect(() => {
    const onZipChanged = () => setZipRevision((n) => n + 1);
    window.addEventListener(HOME_ZIP_CHANGED_EVENT, onZipChanged);
    return () => window.removeEventListener(HOME_ZIP_CHANGED_EVENT, onZipChanged);
  }, []);

  const zip5 = useMemo(
    () => (userEmail ? getStoredHomeZip(userEmail) : ""),
    [userEmail, zipRevision]
  );

  const [boot, setBoot] = useState(() => ({
    ready: zip5.length !== 5,
    center: [MAP_CENTER.lat, MAP_CENTER.lng],
    zoom: DEFAULT_ZOOM,
    deferInitialClinicFly: false
  }));

  useEffect(() => {
    let cancelled = false;

    if (zip5.length !== 5) {
      setBoot({
        ready: true,
        center: [MAP_CENTER.lat, MAP_CENTER.lng],
        zoom: DEFAULT_ZOOM,
        deferInitialClinicFly: false
      });
      return () => {
        cancelled = true;
      };
    }

    setBoot({
      ready: false,
      center: [MAP_CENTER.lat, MAP_CENTER.lng],
      zoom: DEFAULT_ZOOM,
      deferInitialClinicFly: false
    });

    geocodeUsZip(zip5)
      .then(({ lat, lng }) => {
        if (cancelled) return;
        setBoot({
          ready: true,
          center: [lat, lng],
          zoom: ZIP_FRAME_ZOOM,
          deferInitialClinicFly: true
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBoot({
          ready: true,
          center: [MAP_CENTER.lat, MAP_CENTER.lng],
          zoom: DEFAULT_ZOOM,
          deferInitialClinicFly: false
        });
      });

    return () => {
      cancelled = true;
    };
  }, [zip5]);

  const selectedClinic =
    clinics.find((clinic) => clinic.id === selectedClinicId) ?? null;

  const mapKey = boot.ready
    ? `ready-${zip5 || "none"}-${boot.center[0]}-${boot.center[1]}-${boot.zoom}`
    : "loading";

  return (
    <div className="map">
      <div className="map__header">
        <div>
          <p className="eyebrow">Map view</p>
          <h2>Clinics around Pierce County</h2>
        </div>
        <div className="map__legend">
          <span className="legend-item">
            <span className="legend-dot legend-dot--available" />
            Available
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--locked" />
            Temporarily unavailable
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--mixed" />
            Mixed
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--unavailable" />
            Unavailable
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--pending" />
            Pending
          </span>
        </div>
      </div>
      <div className="map__body">
        {!boot.ready ? (
          <div className="map__boot-placeholder muted small">
            Centering map…
          </div>
        ) : (
          <MapContainer
            key={mapKey}
            center={boot.center}
            zoom={boot.zoom}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController
              selectedClinic={selectedClinic}
              deferInitialClinicFly={boot.deferInitialClinicFly}
            />
            <ClinicMarkers
              clinics={clinics}
              selectedClinicId={selectedClinicId}
              onSelectClinic={onSelectClinic}
            />
          </MapContainer>
        )}
      </div>
    </div>
  );
}
