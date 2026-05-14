import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getStoredHomeZip,
  isWelcomeGateDismissed,
  notifyHomeZipChanged,
  setStoredHomeZip,
  setWelcomeGateDismissed,
} from "../lib/welcomeGate.js";

/**
 * Lightboxed welcome shown once per email on this browser (localStorage).
 * Pass forcePreview when URL hash is #welcome-preview — shows anytime for demos (no dismissal saved).
 */
export default function WelcomeGate({ userEmail, forcePreview = false }) {
  const titleId = useId();
  const previewSilencedRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    if (forcePreview) {
      previewSilencedRef.current = false;
      setVisible(true);
      return;
    }
    if (previewSilencedRef.current) return;
    if (isWelcomeGateDismissed(userEmail)) return;
    setVisible(true);
  }, [userEmail, forcePreview]);

  const [homeZip, setHomeZip] = useState(() =>
    userEmail ? getStoredHomeZip(userEmail) : ""
  );

  useEffect(() => {
    if (userEmail) setHomeZip(getStoredHomeZip(userEmail));
  }, [userEmail]);

  const handleDismiss = useCallback(() => {
    if (!userEmail) return;
    setStoredHomeZip(userEmail, homeZip);
    notifyHomeZipChanged();
    if (forcePreview) {
      previewSilencedRef.current = true;
      try {
        const h = window.location.hash.replace(/^#/, "").toLowerCase();
        if (h === "welcome-preview") window.location.hash = "dashboard";
      } catch {
        /* ignore */
      }
    } else {
      setWelcomeGateDismissed(userEmail);
    }
    setVisible(false);
  }, [userEmail, homeZip, forcePreview]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, handleDismiss]);

  if (!visible || !userEmail) return null;

  return createPortal(
    <div
      className="welcome-gate-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div
        className="welcome-gate-modal card modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="welcome-gate__masthead">
          <h2 id={titleId} className="welcome-gate__title">
            Welcome to The Shadow Network
          </h2>
        </header>

        <div className="welcome-gate__body">
          <p className="welcome-gate__lead welcome-gate__lead--first">
            Finding dental shadowing should not depend on cold calling, connections, or luck.
          </p>
          <p className="welcome-gate__lead">
            This platform was created to help students, especially students who do not have connections (like a parent or family member in dentistry), find verified shadowing opportunities more transparently and with less stress.
          </p>

          <section className="welcome-gate__section welcome-gate__section--map" aria-labelledby="welcome-map-heading">
            <h3 id="welcome-map-heading" className="welcome-gate__h3">
              How the map works
            </h3>
            <ul className="welcome-gate__plain-list" aria-label="Map color meanings">
              <li>
                <span className="welcome-gate__swatch welcome-gate__swatch--avail" aria-hidden />
                <span>
                  <strong className="welcome-gate__key">Green</strong>
                  <span className="welcome-gate__equals"> = </span>
                  currently accepting students
                </span>
              </li>
              <li>
                <span className="welcome-gate__swatch welcome-gate__swatch--mixed" aria-hidden />
                <span>
                  <strong className="welcome-gate__key">Yellow</strong>
                  <span className="welcome-gate__equals"> = </span>
                  mixed, limited, or seasonal availability
                </span>
              </li>
              <li>
                <span className="welcome-gate__swatch welcome-gate__swatch--na" aria-hidden />
                <span>
                  <strong className="welcome-gate__key">Red/Gray</strong>
                  <span className="welcome-gate__equals"> = </span>
                  unavailable or not accepting
                </span>
              </li>
            </ul>
            <p className="welcome-gate__reserve-hint">
              Before reaching out to a clinic, please use the Reserve button first. This helps reduce duplicate requests and respects clinic capacity. Each user receives 3 reserves at a time.
            </p>
            <p className="welcome-gate__reserve-hint welcome-gate__reserve-hint--solo">
              Email outreach is usually more successful than cold calling.
            </p>
          </section>

          <section className="welcome-gate__section welcome-gate__section--note" aria-labelledby="welcome-important-heading">
            <h3 id="welcome-important-heading" className="welcome-gate__h3">
              Important to know
            </h3>
            <p>
              This website is community maintained and based on student experiences, surveys, and public information. Because clinics change policies often, the map may not always be fully accurate.
            </p>
            <p>
              If a clinic is no longer accepting students after you reserved it, you can resubmit a clinic (update) to help improve the accuracy of the network for everyone.
            </p>
            <p>
              This platform exists to reduce unnecessary cold contacting, not increase spam. Please research clinics independently, be respectful, and represent the community professionally.
            </p>
          </section>

          <p className="welcome-gate__thanks">
            Thanks for being part of the network and helping make shadowing more accessible for future students.
          </p>

          <div className="welcome-gate__optional">
            <label htmlFor="welcome-home-zip" className="welcome-gate__label">
              ZIP code{" "}
              <span className="welcome-gate__label-hint">
                optional · centers your dashboard map near this area (US)
              </span>
            </label>
            <input
              id="welcome-home-zip"
              type="text"
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              placeholder="e.g. 98402"
              className="welcome-gate__input welcome-gate__input--zip"
              value={homeZip}
              onChange={(e) =>
                setHomeZip(e.target.value.replace(/\D/g, "").slice(0, 5))
              }
            />
          </div>
        </div>

        <div className="welcome-gate__actions">
          <button type="button" className="button button--primary welcome-gate__cta" onClick={handleDismiss}>
            Continue to the map
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
