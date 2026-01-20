const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clinics", label: "Clinics" },
  { id: "guidelines", label: "Guidelines" }
];

export default function SideNav({ activePage, onNavigate }) {
  return (
    <aside className="nav">
      <div className="nav__brand">
        <div className="nav__logo">SM</div>
        <div>
          <p className="nav__title">Shadowing Map</p>
          <p className="nav__subtitle">Dental students</p>
        </div>
      </div>

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
          Use the Clinics to view clinics anb Dashboard to add new clinics.
        </p>
      </div>
    </aside>
  );
}
