import logoImg from "../logo/logo.png";
import IntroMapPreview from "./IntroMapPreview.jsx";

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
          <div
            className="intro-feature__media intro-feature__media--map"
            aria-hidden="true"
          >
            <IntroMapPreview />
          </div>
          <div className="intro-feature__content">
            <h3>Verified Shadowing Map</h3>
            <p>
              See which dental clinics are actually open to student observers, confirmed through direct outreach and community reports.
            </p>
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
