const EMAIL_KEY = "shadowing_verified_email";
const TOKEN_KEY = "shadowing_session_token";

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
    return localStorage.getItem(EMAIL_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setSession(email, token) {
  try {
    localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
    if (token) localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export async function clearSession() {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "DELETE",
        headers: { "x-session-token": token },
      });
    } catch {
      // ignore network errors — local logout still proceeds
    }
  }
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function isAuthenticated() {
  return !!getStoredToken();
}
