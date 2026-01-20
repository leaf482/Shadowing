import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap
} from "react-leaflet";
import { DEFAULT_ZOOM, MAP_CENTER } from "../data/clinics.js";

const STATUS_COLORS = {
  available: "#2ecc71",
  mixed: "#f1c40f",
  unavailable: "#e74c3c",
  pending: "#3b82f6"
};

const flyToClinic = (map, clinic) => {
  map.setView([clinic.lat, clinic.lng], 13, { animate: true });
};

function MapController({ selectedClinic }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedClinic) {
      return;
    }
    flyToClinic(map, selectedClinic);
  }, [map, selectedClinic]);

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
            color: STATUS_COLORS[clinic.shadowingStatus],
            fillColor: STATUS_COLORS[clinic.shadowingStatus],
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

export default function MapPanel({ clinics, selectedClinicId, onSelectClinic }) {
  const selectedClinic =
    clinics.find((clinic) => clinic.id === selectedClinicId) ?? null;

  return (
    <div className="map">
      <div className="map__header">
        <div>
          <p className="eyebrow">Map view</p>
          <h2>Clinics around UW Tacoma</h2>
        </div>
        <div className="map__legend">
          <span className="legend-item">
            <span className="legend-dot legend-dot--available" />
            Available
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
        <MapContainer
          center={[MAP_CENTER.lat, MAP_CENTER.lng]}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController selectedClinic={selectedClinic} />
          <ClinicMarkers
            clinics={clinics}
            selectedClinicId={selectedClinicId}
            onSelectClinic={onSelectClinic}
          />
        </MapContainer>
      </div>
    </div>
  );
}
