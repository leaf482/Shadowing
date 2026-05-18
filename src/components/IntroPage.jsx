import logoImg from "../logo/logo.png";
import dashboardImg from "../assets/intro-dashboard.png";
import trackerImg from "../assets/intro-tracker.png";

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
          <p className="intro__scroll-hint">
            Scroll to preview dashboard and tracker features
          </p>
        </div>
      </section>

      <section className="intro__overview intro-preview" aria-labelledby="intro-preview-title">
        <header className="intro-preview__header">
          <p className="intro-eyebrow">Inside the platform</p>
          <h2 id="intro-preview-title">See how it works</h2>
          <p className="intro-preview__lead">
            A verified clinic map plus a single place to log hours—built so you spend less time chasing info and more time in clinics.
          </p>
        </header>

        <div className="intro-preview__cards">
          <article className="intro-preview-card">
            <div className="intro-preview-card__copy">
              <p className="intro-preview-card__step">
                <span className="intro-preview-card__step-num">01</span>
                <span className="intro-preview-card__step-label">Map</span>
              </p>
              <h3>Verified shadowing map</h3>
              <ul className="intro-preview-card__bullets">
                <li>Pierce County clinics with acceptance cues before you cold-call.</li>
                <li>Statuses grounded in outreach and community updates—not rumors.</li>
                <li>Open details when you need addresses, notes, or next steps.</li>
              </ul>
            </div>
            <div className="intro-preview-card__shot intro-preview-card__shot--dashboard">
              <img
                src={dashboardImg}
                alt="Dashboard preview showing the clinic map, filters, and clinic details panel."
                className="intro-preview-card__img"
                loading="lazy"
                decoding="async"
              />
            </div>
          </article>

          <article className="intro-preview-card intro-preview-card--alt">
            <div className="intro-preview-card__copy">
              <p className="intro-preview-card__step">
                <span className="intro-preview-card__step-num">02</span>
                <span className="intro-preview-card__step-label">Tracker</span>
              </p>
              <h3>Shadowing &amp; volunteering tracking</h3>
              <ul className="intro-preview-card__bullets">
                <li>Separate totals for shadowing vs volunteering—no mental math.</li>
                <li>Clinic notes and outreach sit next to your hours in one workflow.</li>
                <li>Records stay organized when it is time for AADSAS.</li>
              </ul>
              <aside className="intro-preview-card__aside">
                <strong>For applications:</strong> documentation stays tight without juggling spreadsheets or scattered screenshots.
              </aside>
            </div>
            <div className="intro-preview-card__shot intro-preview-card__shot--tracker">
              <img
                src={trackerImg}
                alt="My tracker preview showing shadowing hours, volunteering placements, and AADSAS entries."
                className="intro-preview-card__img"
                loading="lazy"
                decoding="async"
              />
            </div>
          </article>
        </div>
      </section>

      <footer className="intro__footer">
        <p>
          Student-run directory. Data is publicly sourced and community
          maintained. Clinics may request removal at any time.
        </p>
        <p>
          Questions? Contact{" "}
          <a href="mailto:shadowingnetwork2026@gmail.com">
            shadowingnetwork2026@gmail.com
          </a>
        </p>
      </footer>
    </div>
  );
}
