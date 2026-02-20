import logoImg from "../logo/logo.png";

export default function IntroPage({ onGetStarted }) {
  return (
    <div className="intro">
      <div className="intro__inner">
        <img src={logoImg} alt="" className="intro__logo" />
        <p className="intro__tagline">
          Find dental shadowing opportunities in the UW Tacoma region.
        </p>
        <p className="intro__muted">
          Verified clinics, one request at a time. For UW students only.
        </p>
        <button
          type="button"
          className="intro__cta"
          onClick={onGetStarted}
        >
          Get started
        </button>
      </div>
    </div>
  );
}
