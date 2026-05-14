const EMAIL_KEY = "shadowing_verified_email";
const AUTH_NOTICE_KEY = "shadowing_auth_notice";

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

export function setSession(email) {
  try {
    localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
    return true;
  } catch {
    return false;
  }
}

function clearLocalSessionStorage() {
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {}
}

function setAuthNotice(message) {
  try {
    sessionStorage.setItem(AUTH_NOTICE_KEY, message);
  } catch {}
}

export function consumeAuthNotice() {
  try {
    const message = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (message) {
      sessionStorage.removeItem(AUTH_NOTICE_KEY);
      return message;
    }
  } catch {}
  return "";
}

export async function authFetch(url, options = {}) {
  const { skipAuthRedirect = false, ...init } = options;
  const headers = new Headers(init.headers || {});

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 && !skipAuthRedirect) {
    let requestId = response.headers.get("x-request-id") || "";
    try {
      const data = await response.clone().json();
      if (data?.requestId) requestId = data.requestId;
    } catch {}

    const suffix = requestId ? ` (Ref: ${requestId})` : "";
    setAuthNotice(`Your session expired. Please sign in again.${suffix}`);
    await clearSession();
    window.location.hash = "login";
    window.location.reload();
  }

  return response;
}

export async function formatApiErrorMessage(response, fallbackMessage) {
  let requestId = response?.headers?.get?.("x-request-id") || "";
  let payload = {};

  try {
    payload = await response.clone().json();
    if (payload?.requestId) requestId = payload.requestId;
  } catch {}

  const base = payload?.error || fallbackMessage;
  return requestId ? `${base} (Ref: ${requestId})` : base;
}

export async function clearSession() {
  try {
    await fetch("/api/auth/logout", {
      method: "DELETE",
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
      return {
        authenticated: true,
        email: data.email,
        isAdmin: !!data.isAdmin
      };
    }
    clearLocalSessionStorage();
    return { authenticated: false, isAdmin: false };
  } catch {
    return { authenticated: false, isAdmin: false };
  }
}

export function isAuthenticated() {
  return !!getStoredEmail();
}
