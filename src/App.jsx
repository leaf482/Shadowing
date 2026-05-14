import { useEffect, useMemo, useState } from "react";
import { MAP_CENTER } from "./data/clinics.js";
import { PRIMARY_SPECIALTY_FILTER_OPTIONS, SECONDARY_FILTERS } from "./data/specialties.js";
import { isAuthenticated, clearSession, getStoredEmail, authFetch, restoreSessionFromServer, formatApiErrorMessage } from "./lib/auth.js";
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
const ADMIN_MODE_KEY = "shadowing_admin_mode";

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
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  useEffect(() => {
    let active = true;
    restoreSessionFromServer().then((session) => {
      if (!active) return;
      setAuthenticated(session.authenticated);
      setIsAdmin(!!session.isAdmin);
      if (session.isAdmin) {
        try {
          setAdminMode(localStorage.getItem(ADMIN_MODE_KEY) === "true");
        } catch {
          setAdminMode(false);
        }
      } else {
        setAdminMode(false);
      }
      setAuthReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(parseHash());
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!authReady) return;
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
  }, [authReady, authenticated, activePage]);

  const handleNavigate = (page) => {
    window.location.hash = page;
  };

  const handleGetStarted = () => {
    window.location.hash = "login";
  };

  const handleLoginSuccess = async () => {
    setAuthenticated(true);
    const session = await restoreSessionFromServer();
    setIsAdmin(!!session.isAdmin);
    setAdminMode(false);
    window.location.hash = "dashboard";
  };

  const [zipFilter, setZipFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [milesFilter, setMilesFilter] = useState("10");

  const selectedClinic = useMemo(
    () => {
      const clinic = clinics.find((row) => row.id === selectedClinicId) ?? null;
      if (!clinic) return null;
      return {
        ...clinic,
        canManage: !!clinic.ownedByCurrentUser || (isAdmin && adminMode && clinic.canManage)
      };
    },
    [clinics, selectedClinicId, isAdmin, adminMode]
  );

  const handleSelectClinic = (clinicId) => {
    setSelectedClinicId(clinicId);
  };

  const fetchClinics = async () => {
    const response = await fetch("/api/clinics");
    if (!response.ok) {
      const message = await formatApiErrorMessage(response, "Failed to load clinics.");
      throw new Error(message);
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
      setLoadError(error?.message || "Could not load data from SQLite server.");
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

    const response = await authFetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload.proposed)
    });

    if (response.ok) {
      await refreshData();
    } else {
      setLoadError(await formatApiErrorMessage(response, "Could not save clinic."));
    }
  };

  const statusOptions = Object.entries(STATUS_LABELS).map(
    ([value, label]) => ({
      value,
      label
    })
  );

  if (!authenticated) {
    if (!authReady) {
      return null;
    }
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
        onBrandClick={() => {
          window.location.hash = "dashboard";
          window.location.reload();
        }}
        userEmail={getStoredEmail()}
        isAdmin={isAdmin}
        adminMode={adminMode}
        onAdminModeChange={(nextValue) => {
          setAdminMode(nextValue);
          try {
            localStorage.setItem(ADMIN_MODE_KEY, String(nextValue));
          } catch {}
        }}
        onLogout={async () => {
          await clearSession();
          setAuthenticated(false);
          setIsAdmin(false);
          setAdminMode(false);
          window.location.hash = "intro";
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
        ) : (() => {
          const availableCount   = clinics.filter(c => c.shadowingStatus === "available").length;
          const unavailableCount = clinics.filter(c => c.shadowingStatus === "unavailable").length;
          const mixedCount       = clinics.filter(c => c.shadowingStatus === "mixed").length;
          return (
            <>
              {/* Page header */}
              <div className="topbar">
                <div className="page-header">
                  <p className="eyebrow">Pierce County · UW Tacoma region</p>
                  <h1>Dashboard</h1>
                  <p className="muted" style={{ fontSize: "0.9rem" }}>
                    Community-reported dental clinic directory for pre-dental students.
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="dash-stats">
                <div className="dash-stat">
                  <span className="dash-stat__num">{clinics.length}</span>
                  <span className="dash-stat__label">Total clinics</span>
                </div>
                <div className="dash-stat dash-stat--available">
                  <span className="dash-stat__num">{availableCount}</span>
                  <span className="dash-stat__label">Accepting students</span>
                </div>
                <div className="dash-stat dash-stat--mixed">
                  <span className="dash-stat__num">{mixedCount}</span>
                  <span className="dash-stat__label">Mixed / seasonal</span>
                </div>
                <div className="dash-stat dash-stat--unavailable">
                  <span className="dash-stat__num">{unavailableCount}</span>
                  <span className="dash-stat__label">Not accepting</span>
                </div>
              </div>

              {/* Main grid */}
              <div className="dash-grid">
                <section className="dash-grid__form">
                  <HubPanel
                    clinics={clinics}
                    onCreateSubmission={handleCreateSubmission}
                    statusOptions={statusOptions}
                    centerFallback={CENTER_FALLBACK}
                    isLoading={isLoading}
                    loadError={loadError}
                  />
                </section>
                <section className="dash-grid__map panel panel--map">
                  <MapPanel
                    clinics={clinics}
                    selectedClinicId={selectedClinicId}
                    onSelectClinic={handleSelectClinic}
                  />
                </section>
                <section className="dash-grid__details">
                  <ClinicTrackerPanel
                    clinic={selectedClinic}
                    statusLabels={STATUS_LABELS}
                    onRefreshClinics={refreshData}
                  />
                </section>
              </div>
            </>
          );
        })()}
        <footer className="app-footer">
          <p>Student-run directory. Data is publicly sourced and community maintained. Clinics may request removal at any time.</p>
          <p>
            Questions? Contact{" "}
            <a href="mailto:shadowingnetwork2026@gmail.com">shadowingnetwork2026@gmail.com</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
