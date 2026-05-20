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
            Find dental shadowing opportunities
          </p>
          <p className="intro__muted">
            Shadow smart, shadow secure
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
          <p className="intro-eyebrow">Platform Overview</p>
          <h2 id="intro-preview-title">
            Creating a system that makes verified shadowing opportunities more
            accessible for students without existing connections, while also using
            built in safeguards to prevent clinics from being overwhelmed with
            excessive outreach.
          </h2>
          <p className="intro-preview__lead">
            Right now it&apos;s open to anyone with UW email
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
                <li>
                  Verified clinic map with real community reported shadowing
                  availability across Pierce County.
                </li>
                <li>
                  Reserve system helps prevent clinics from getting overwhelmed
                  with dozens of student requests at once.
                </li>
                <li>
                  Designed to streamline finding shadowing opportunities without
                  the awkward cold calling and constant guessing.
                </li>
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
                <li>
                  Log shadowing hours, volunteering, clinic notes, and outreach
                  activity in one place, with separate totals and organized records
                  ready for AADSAS.
                </li>
              </ul>
              <aside className="intro-preview-card__aside">
                <strong>Goal:</strong> keep your application records organized
                without spreadsheets, scattered notes, or lost hours.
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
