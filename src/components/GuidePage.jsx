export default function GuidePage() {
  return (
    <div className="guidelines">
      <header className="guidelines__header">
        <div>
          <p className="eyebrow">Guidelines</p>
          <h1>How to use the Dental Shadowing Map</h1>
          <p className="muted">
            Quick steps for finding clinics, adding updates, and keeping data
            accurate for everyone.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Quick guide</h2>
        <ol>
          <li>Open the Dashboard to view pins around UW Tacoma.</li>
          <li>Click a pin to see clinic details on the right panel.</li>
          <li>Use Clinics to filter by ZIP code, status, and radius.</li>
          <li>Use Add clinic to save new or updated clinic info.</li>
          <li>Confirm availability with the clinic before visiting.</li>
          <li>Keep notes short and avoid personal details.</li>
        </ol>
      </section>
    </div>
  );
}
