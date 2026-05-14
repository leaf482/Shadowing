/**
 * One-time welcome modal per browser + verified email.
 * Bump WELCOME_GATE_CONTENT_VERSION when copy changes materially (shows again once).
 */
export const WELCOME_GATE_CONTENT_VERSION = "1";

function dismissedKey(email) {
  const e = (email || "").trim().toLowerCase();
  return `shadowing_welcome_v${WELCOME_GATE_CONTENT_VERSION}_dismissed:${e}`;
}

/** Home ZIP for dashboard map framing (US, 5 digits). */
function homeZipKey(email) {
  const e = (email || "").trim().toLowerCase();
  return `shadowing_map_focus_zip:${e}`;
}

export function isWelcomeGateDismissed(email) {
  if (!email) return true;
  try {
    return localStorage.getItem(dismissedKey(email)) === "1";
  } catch {
    return true;
  }
}

export function setWelcomeGateDismissed(email) {
  if (!email) return;
  try {
    localStorage.setItem(dismissedKey(email), "1");
  } catch {}
}

/** 5-digit US ZIP stored from welcome gate; drives dashboard map center when valid. */
export function getStoredHomeZip(email) {
  if (!email) return "";
  try {
    const raw = localStorage.getItem(homeZipKey(email)) || "";
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    return digits.length === 5 ? digits : "";
  } catch {
    return "";
  }
}

export function setStoredHomeZip(email, zipInput) {
  if (!email) return;
  const trimmed = (zipInput || "").replace(/\D/g, "").slice(0, 5);
  try {
    if (trimmed.length === 5) localStorage.setItem(homeZipKey(email), trimmed);
    else localStorage.removeItem(homeZipKey(email));
  } catch {}
}

export const HOME_ZIP_CHANGED_EVENT = "shadowing-home-zip-changed";

export function notifyHomeZipChanged() {
  try {
    window.dispatchEvent(new CustomEvent(HOME_ZIP_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
