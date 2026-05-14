import logoImg from "../logo/logo.png";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="0" y="0" width="7" height="7" rx="1.5"/>
        <rect x="9" y="0" width="7" height="7" rx="1.5"/>
        <rect x="0" y="9" width="7" height="7" rx="1.5"/>
        <rect x="9" y="9" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    id: "tracker",
    label: "Tracker",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="9" width="3" height="6" rx="1"/>
        <rect x="6" y="5" width="3" height="10" rx="1"/>
        <rect x="11" y="1" width="3" height="14" rx="1"/>
      </svg>
    ),
  },
  {
    id: "clinics",
    label: "Clinics",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" opacity="0.3"/>
        <path d="M5 3V2a1 1 0 012 0v1M9 3V2a1 1 0 012 0v1M2 7h12"/>
        <rect x="7" y="9" width="2" height="1" rx="0.5"/>
        <rect x="7.5" y="8.5" width="1" height="2" rx="0.5"/>
      </svg>
    ),
  },
  {
    id: "guidelines",
    label: "Guidelines",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="2" y="3" width="12" height="1.5" rx="0.75"/>
        <rect x="2" y="7" width="8" height="1.5" rx="0.75"/>
        <rect x="2" y="11" width="10" height="1.5" rx="0.75"/>
      </svg>
    ),
  },
];

export default function SideNav({
  activePage,
  onNavigate,
  onLogout,
  userEmail,
  onBrandClick,
  isAdmin = false,
  adminMode = false,
  onAdminModeChange
}) {
  return (
    <aside className="nav">
      <button
        type="button"
        className="nav__brand"
        onClick={onBrandClick}
        aria-label="Go to dashboard and refresh"
      >
        <img src={logoImg} alt="Shadow Network" className="nav__logo-img" />
        <span className="nav__beta">Beta</span>
      </button>

      <div className="nav__bar">
        <nav className="nav__menu">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activePage ? "nav__item is-active" : "nav__item"}
              onClick={() => onNavigate(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="nav__divider" />

        {userEmail && (
          <div style={{ padding: "0 0.25rem" }}>
            <p className="label" style={{ marginBottom: "0.15rem" }}>Signed in as</p>
            <p className="small" style={{ color: "#94a3b8", margin: 0, wordBreak: "break-all", lineHeight: 1.3 }}>
              {userEmail}
            </p>
          </div>
        )}

        <div className="nav__footer">
          <p className="label" style={{ marginBottom: "0.3rem" }}>Quick tip</p>
          <p className="muted small" style={{ margin: 0 }}>
            Log sessions in Tracker. Use Clinics to find shadowing opportunities.
          </p>
        </div>

        <div className="nav__bottom">
          {isAdmin && (
            <div className="nav__admin-toggle" role="group" aria-label="Admin mode">
              <span className="nav__admin-label">User</span>
              <button
                type="button"
                className={adminMode ? "nav__toggle is-on" : "nav__toggle"}
                aria-pressed={adminMode}
                onClick={() => onAdminModeChange?.(!adminMode)}
              >
                <span />
              </button>
              <span className="nav__admin-label">Admin</span>
            </div>
          )}

          {onLogout && (
            <button type="button" className="nav__logout" onClick={onLogout}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M6 2H3a1 1 0 00-1 1v9a1 1 0 001 1h3M10 10l3-3-3-3M13 7H5"/>
              </svg>
              Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
