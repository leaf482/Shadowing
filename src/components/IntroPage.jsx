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
          <h2>Platform Preview</h2>
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
            <h3>Verified Shadowing Map</h3>
            <p>
              See which dental clinics are actually open to student observers, confirmed through direct outreach and community reports. Status markers show at a glance which offices are currently accepting shadowing requests, so students stop guessing and start finding real opportunities.
            </p>
            <p>
              The built in reserve system spaces out requests so no single clinic gets flooded by dozens of students at once, protecting the relationships that keep shadowing accessible for everyone.
            </p>
            <p className="muted small">Goal: cut down on cold calling, surface clearer information about clinics open to observers, and make dental shadowing reachable for students without personal or family connections in the field.</p>
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
            <h3>Shadowing and Volunteering Tracking</h3>
            <p>
              Log shadowing hours, volunteering, clinic notes, and outreach activity in one place, with separate totals and organized records ready for AADSAS.
            </p>
            <p className="muted small">Goal: application ready documentation without spreadsheets or scattered notes.</p>
          </div>
        </article>
      </section>

      <footer className="intro__footer">
        <p>Student-run directory. Data is publicly sourced and community maintained. Clinics may request removal at any time.</p>
        <p>
          Questions? Contact{" "}
          <a href="mailto:shadowingnetwork2026@gmail.com">shadowingnetwork2026@gmail.com</a>
        </p>
      </footer>
    </div>
  );
}
