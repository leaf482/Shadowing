import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "./data/clinics.js";
import { PRIMARY_SPECIALTY_FILTER_OPTIONS, SECONDARY_FILTERS } from "./data/specialties.js";
import { isAuthenticated, clearSession } from "./lib/auth.js";
import SideNav from "./components/SideNav.jsx";
import HubPanel from "./components/HubPanel.jsx";
import MapPanel from "./components/MapPanel.jsx";
import ClinicTrackerPanel from "./components/ClinicTrackerPanel.jsx";
import ClinicsPage from "./components/ClinicsPage.jsx";
import GuidePage from "./components/GuidePage.jsx";
import TrackerPage from "./components/TrackerPage.jsx";
import IntroPage from "./components/IntroPage.jsx";
import LoginPage from "./components/LoginPage.jsx";

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

const MAIN_PAGES = ["dashboard", "tracker", "clinics", "guidelines"];

function parseHash() {
  const raw = window.location.hash.replace("#", "").toLowerCase();
  return raw || "intro";
}

export default function App() {
  const [clinics, setClinics] = useState([]);
  const [selectedClinicId, setSelectedClinicId] = useState(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePage, setActivePage] = useState(parseHash());

  const authenticated = isAuthenticated();

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(parseHash());
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const page = parseHash();
    if (!authenticated) {
      if (MAIN_PAGES.includes(page)) {
        window.location.hash = "intro";
      }
    } else {
      if (page === "intro" || page === "login") {
        window.location.hash = "dashboard";
      }
    }
  }, [authenticated, activePage]);

  const handleNavigate = (page) => {
    window.location.hash = page;
  };

  const handleGetStarted = () => {
    window.location.hash = "login";
  };

  const handleLoginSuccess = () => {
    window.location.hash = "dashboard";
    window.location.reload();
  };

  const [zipFilter, setZipFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
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

  if (!authenticated) {
    if (activePage === "login") {
      return (
        <LoginPage
          onSuccess={handleLoginSuccess}
          onBack={() => (window.location.hash = "intro")}
        />
      );
    }
    return <IntroPage onGetStarted={handleGetStarted} />;
  }

  const mainPage = MAIN_PAGES.includes(activePage) ? activePage : "dashboard";

  return (
    <div className="layout">
      <SideNav
        activePage={mainPage}
        onNavigate={handleNavigate}
        onLogout={async () => {
          await clearSession();
          window.location.hash = "intro";
          window.location.reload();
        }}
      />
      <div className="content">
        <div className="dev-notice-row">
          <div className="dev-notice" role="status">
            <span className="dev-notice__label">In development</span>
            <span className="dev-notice__text">This site is still in development; features and data may change.</span>
          </div>
        </div>
        {mainPage === "tracker" ? (
          <TrackerPage />
        ) : mainPage === "clinics" ? (
          <ClinicsPage
            clinics={clinics}
            statusOptions={statusOptions}
            specialtyFilterOptions={PRIMARY_SPECIALTY_FILTER_OPTIONS}
            specialtyFilter={specialtyFilter}
            setSpecialtyFilter={setSpecialtyFilter}
            secondaryFilterOptions={SECONDARY_FILTERS}
            secondaryFilter={secondaryFilter}
            setSecondaryFilter={setSecondaryFilter}
            zipFilter={zipFilter}
            setZipFilter={setZipFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            milesFilter={milesFilter}
            setMilesFilter={setMilesFilter}
            onRefreshClinics={refreshData}
          />
        ) : mainPage === "guidelines" ? (
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
