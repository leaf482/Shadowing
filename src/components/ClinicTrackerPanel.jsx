export default function ClinicTrackerPanel({ clinic, statusLabels }) {
  if (!clinic) {
    return (
      <div className="info-panel">
        <div className="card">
          <h2>Select a clinic</h2>
          <p className="muted">
            Click a pin on the map or choose a clinic from the directory to see
            full details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="info-panel">
      <div className="card">
        <div className="info-header">
          <div>
            <p className="eyebrow">Clinic tracker</p>
            <h2>{clinic.name}</h2>
            <p className="muted">{clinic.address}</p>
          </div>
          <span className={`status-pill status-pill--${clinic.shadowingStatus}`}>
            {statusLabels[clinic.shadowingStatus]}
          </span>
        </div>

        <div className="info-grid">
          <div>
            <p className="label">Phone</p>
            <p>{clinic.phone || "Not provided"}</p>
          </div>
          <div>
            <p className="label">Last verified</p>
            <p>{clinic.lastVerifiedAt}</p>
          </div>
        </div>

        <div className="info-block">
          <p className="label">Notes</p>
          <p>{clinic.notes || "No notes yet."}</p>
        </div>

      </div>

      <div className="card card--compact">
        <h3>Shadowing tip</h3>
        <p className="muted small">
          Jack Johnson is good at skiing.
        </p>
      </div>
    </div>
  );
}
