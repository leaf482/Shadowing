import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "./data/clinics.js";
import SideNav from "./components/SideNav.jsx";
import HubPanel from "./components/HubPanel.jsx";
import MapPanel from "./components/MapPanel.jsx";
import ClinicTrackerPanel from "./components/ClinicTrackerPanel.jsx";
import ClinicsPage from "./components/ClinicsPage.jsx";
import GuidePage from "./components/GuidePage.jsx";
import TrackerPage from "./components/TrackerPage.jsx";

const STATUS_LABELS = {
  available: "Shadowing available",
  mixed: "Mixed / unverified",
  unavailable: "Not accepting",
  pending: "Pending review"
};

const CENTER_FALLBACK = {
  lat: MAP_CENTER.lat,
  lng: MAP_CENTER.lng
};

export default function App() {
  const [clinics, setClinics] = useState([]);
  const [selectedClinicId, setSelectedClinicId] = useState(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePage, setActivePage] = useState("dashboard");
  useEffect(() => {
    const parseHash = () => {
      const raw = window.location.hash.replace("#", "");
      return raw === "" ? "dashboard" : raw;
    };

    const handleHashChange = () => {
      setActivePage(parseHash());
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleNavigate = (page) => {
    window.location.hash = page;
  };

  const [zipFilter, setZipFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [milesFilter, setMilesFilter] = useState("10");

  const selectedClinic = useMemo(
    () => clinics.find((clinic) => clinic.id === selectedClinicId) ?? null,
    [clinics, selectedClinicId]
  );

  const handleSelectClinic = (clinicId) => {
    setSelectedClinicId(clinicId);
  };

  const fetchClinics = async () => {
    const response = await fetch("/api/clinics");
    if (!response.ok) {
      throw new Error("Failed to load clinics.");
    }
    return response.json();
  };

  const refreshData = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const clinicRows = await fetchClinics();
      setClinics(clinicRows);
      if (!selectedClinicId && clinicRows.length > 0) {
        setSelectedClinicId(clinicRows[0].id);
      }
    } catch (error) {
      setLoadError("Could not load data from SQLite server.");
      setClinics([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleCreateSubmission = async (payload) => {
    const isUpdate = payload.type === "update" && payload.clinicId;
    const endpoint = isUpdate
      ? `/api/clinics/${payload.clinicId}`
      : "/api/clinics";
    const method = isUpdate ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.proposed)
    });

    if (response.ok) {
      await refreshData();
      setFormMode("new");
      setFormClinicId(null);
    } else {
      setLoadError("Could not save clinic.");
    }
  };

  const statusOptions = Object.entries(STATUS_LABELS).map(
    ([value, label]) => ({
      value,
      label
    })
  );

  return (
    <div className="layout">
      <SideNav activePage={activePage} onNavigate={handleNavigate} />
      <div className="content">
        {activePage === "tracker" ? (
          <TrackerPage />
        ) : activePage === "clinics" ? (
          <ClinicsPage
            clinics={clinics}
            statusOptions={statusOptions}
            zipFilter={zipFilter}
            setZipFilter={setZipFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            milesFilter={milesFilter}
            setMilesFilter={setMilesFilter}
          />
        ) : activePage === "guidelines" ? (
          <GuidePage />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">UW Tacoma region</p>
                <h1>Dashboard</h1>
                <p className="muted">
                  Verified dental clinics, map discovery.
                </p>
              </div>
            </header>

            <div className="grid">
              <section className="panel panel--left">
                <HubPanel
                  clinics={clinics}
                  onCreateSubmission={handleCreateSubmission}
                  statusOptions={statusOptions}
                  centerFallback={CENTER_FALLBACK}
                  isLoading={isLoading}
                  loadError={loadError}
                />
              </section>
              <section className="panel panel--map">
                <MapPanel
                  clinics={clinics}
                  selectedClinicId={selectedClinicId}
                  onSelectClinic={handleSelectClinic}
                />
              </section>
              <section className="panel panel--right">
                <ClinicTrackerPanel
                  clinic={selectedClinic}
                  statusLabels={STATUS_LABELS}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
