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
    if (token) {
      // Legacy token compatibility during migration away from localStorage auth.
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

function clearLocalSessionStorage() {
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function authFetch(url, options = {}) {
  const { skipAuthRedirect = false, ...init } = options;
  const headers = new Headers(init.headers || {});
  const token = getStoredToken();

  // Kept for a safe rollout. Server also accepts HttpOnly cookie sessions.
  if (token && !headers.has("x-session-token")) {
    headers.set("x-session-token", token);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 && !skipAuthRedirect) {
    await clearSession();
    window.location.hash = "login";
    window.location.reload();
  }

  return response;
}

export async function clearSession() {
  const token = getStoredToken();
  const headers = token ? { "x-session-token": token } : {};
  try {
    await fetch("/api/auth/logout", {
      method: "DELETE",
      headers,
      credentials: "same-origin",
    });
  } catch {
    // ignore network errors — local logout still proceeds
  }
  clearLocalSessionStorage();
}

export async function restoreSessionFromServer() {
  try {
    const res = await authFetch("/api/auth/session", { skipAuthRedirect: true });
    if (!res.ok) {
      clearLocalSessionStorage();
      return false;
    }
    const data = await res.json().catch(() => ({}));
    if (data?.email) {
      setSession(data.email);
      return true;
    }
    clearLocalSessionStorage();
    return false;
  } catch {
    return false;
  }
}

export function isAuthenticated() {
  return !!getStoredEmail();
}
