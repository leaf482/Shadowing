const STORAGE_KEY = "shadowing_verified_email";

const UW_DOMAINS = [
  "uw.edu",
  "washington.edu",
  "u.washington.edu"
];

export function isUWEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  const domain = normalized.split("@")[1];
  return UW_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export function getStoredEmail() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSession(email) {
  try {
    localStorage.setItem(STORAGE_KEY, email.trim().toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function isAuthenticated() {
  const email = getStoredEmail();
  return !!email && isUWEmail(email);
}
