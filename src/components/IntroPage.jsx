import logoImg from "../logo/logo.png";

export default function IntroPage({ onGetStarted }) {
  return (
    <div className="intro">
      <section className="intro__hero">
        <div className="intro__inner">
          <img src={logoImg} alt="" className="intro__logo" />
          <p className="intro__tagline">
            Find dental shadowing opportunities in the UW Tacoma region.
          </p>
          <p className="intro__muted">
            Verified clinics, one request at a time.
          </p>
          <button
            type="button"
            className="intro__cta"
            onClick={onGetStarted}
          >
            Get started
          </button>
          <p className="intro__scroll-hint">Scroll to preview map and tracker features</p>
        </div>
      </section>

      <section className="intro__overview">
        <div className="intro__overview-head">
          <p className="eyebrow">Platform Overview</p>
          <h2>See what you can do before signing in</h2>
        </div>

        <article className="intro-feature">
          <div className="intro-feature__media intro-feature__media--map" aria-hidden="true">
            <div className="map-mock">
              <div className="map-mock__grid" />
              <span className="map-mock__dot map-mock__dot--available" style={{ left: "22%", top: "36%" }} />
              <span className="map-mock__dot map-mock__dot--mixed" style={{ left: "48%", top: "45%" }} />
              <span className="map-mock__dot map-mock__dot--unavailable" style={{ left: "68%", top: "30%" }} />
              <span className="map-mock__dot map-mock__dot--pending" style={{ left: "61%", top: "68%" }} />
              <span className="map-mock__dot map-mock__dot--available" style={{ left: "34%", top: "62%" }} />
            </div>
          </div>
          <div className="intro-feature__content">
            <h3>Interactive Shadow Map</h3>
            <p>
              Quickly scan clinic availability and focus on verified places near UW Tacoma. Colored dots show status at a glance.
            </p>
            <p className="muted small">Goal: faster discovery with fewer dead-end outreach attempts.</p>
          </div>
        </article>

        <article className="intro-feature intro-feature--reverse">
          <div className="intro-feature__media intro-feature__media--tracker" aria-hidden="true">
            <div className="tracker-mock">
              <div className="tracker-mock__row">
                <span>Walker &amp; Krause</span>
                <strong>24.5h</strong>
              </div>
              <div className="tracker-mock__bar"><span style={{ width: "78%" }} /></div>
              <div className="tracker-mock__row">
                <span>Community Dental</span>
                <strong>11.0h</strong>
              </div>
              <div className="tracker-mock__bar"><span style={{ width: "46%" }} /></div>
              <div className="tracker-mock__row">
                <span>Volunteering</span>
                <strong>8.75h</strong>
              </div>
              <div className="tracker-mock__bar tracker-mock__bar--green"><span style={{ width: "34%" }} /></div>
            </div>
          </div>
          <div className="intro-feature__content">
            <h3>Dental Tracking Built In</h3>
            <p>
              Log sessions, keep project notes, and monitor shadowing and volunteering totals separately in one place.
            </p>
            <p className="muted small">Goal: application-ready records without spreadsheets.</p>
          </div>
        </article>
      </section>
    </div>
  );
}
