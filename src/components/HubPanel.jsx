import ClinicForm from "./ClinicForm.jsx";

export default function HubPanel({
  clinics,
  onCreateSubmission,
  statusOptions,
  centerFallback,
  isLoading,
  loadError
}) {
  return (
    <div className="sidebar">
      <section className="card">
        <div className="hub-panel__header">
          <div className="hub-panel__icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <path d="M9 1a8 8 0 100 16A8 8 0 009 1z" opacity="0.15"/>
              <rect x="8" y="4" width="2" height="7" rx="1"/>
              <rect x="5.5" y="7" width="7" height="2" rx="1"/>
            </svg>
          </div>
          <div>
            <h2 className="hub-panel__title">Add clinic</h2>
            <p className="hub-panel__sub">Submit a new clinic to the directory</p>
          </div>
        </div>

        {isLoading && (
          <p className="muted small" style={{ marginBottom: "0.75rem" }}>
            Loading clinics…
          </p>
        )}
        {loadError && (
          <p className="muted small" style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>
            {loadError}
          </p>
        )}

        <ClinicForm
          clinics={clinics}
          statusOptions={statusOptions}
          onSubmit={onCreateSubmission}
          centerFallback={centerFallback}
        />
      </section>
    </div>
  );
}
