import logoImg from "../logo/logo.png";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tracker", label: "Tracker" },
  { id: "clinics", label: "Clinics" },
  { id: "guidelines", label: "Guidelines" }
];

export default function SideNav({ activePage, onNavigate, onLogout }) {
  return (
    <aside className="nav">
      <div className="nav__brand">
        <img src={logoImg} alt="" className="nav__logo-img" />
      </div>

      <div className="nav__bar">
        <nav className="nav__menu">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === activePage ? "nav__item is-active" : "nav__item"
              }
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="nav__footer card">
          <p className="label">Quick tip</p>
          <p className="muted small">
            Use the Clinics to view clinics and Dashboard to add new clinics.
          </p>
        </div>

        {onLogout ? (
          <button
            type="button"
            className="nav__logout"
            onClick={onLogout}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </aside>
  );
}
