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
        <div className="section-header">
          <h2>Add clinic</h2>
        </div>
        {isLoading ? <p className="muted small">Loading clinics...</p> : null}
        {loadError ? <p className="muted small">{loadError}</p> : null}
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
