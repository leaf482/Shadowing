const STORAGE_KEY = "shadowing_verified_email";

export function isEduEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  const domain = normalized.split("@")[1];
  return typeof domain === "string" && domain.endsWith(".edu");
}

// Kept as alias so existing imports continue to work
export const isUWEmail = isEduEmail;

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
  return !!email && isEduEmail(email);
}
