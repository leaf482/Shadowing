const EMAIL_KEY = "shadowing_verified_email";
const ID_TOKEN_KEY = "shadowing_id_token";
const REFRESH_TOKEN_KEY = "shadowing_refresh_token";
const AUTH_NOTICE_KEY = "shadowing_auth_notice";
export const ADMIN_MODE_KEY = "shadowing_admin_mode";

let authConfigCache = null;

export function isEduEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  const domain = normalized.split("@")[1];
  return typeof domain === "string" && domain.endsWith(".edu");
}

export const isUWEmail = isEduEmail;

export async function fetchAuthConfig() {
  if (authConfigCache) return authConfigCache;
  try {
    const res = await fetch("/api/auth/config");
    authConfigCache = await res.json();
    return authConfigCache;
  } catch {
    return { authMode: "unconfigured", cognito: null };
  }
}

export async function initCognitoAuth() {
  const config = await fetchAuthConfig();
  if (config.authMode === "cognito" && config.cognito) {
    const { configureCognitoPool } = await import("./cognitoClient.js");
    configureCognitoPool(config.cognito);
    return { ok: true, config };
  }
  return { ok: false, config };
}

export async function signInWithPassword(email, password) {
  const { cognitoSignIn } = await import("./cognitoClient.js");
  const session = await cognitoSignIn(email, password);
  persistCognitoTokens(session);
  return session;
}

export function getStoredEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || null;
  } catch {
    return null;
  }
}

export function getBearerToken() {
  try {
    return localStorage.getItem(ID_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function persistCognitoTokens({ email, idToken, refreshToken }) {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
    if (idToken) localStorage.setItem(ID_TOKEN_KEY, idToken);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    return true;
  } catch {
    return false;
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
    localStorage.removeItem(ID_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {}
}

function setAuthNotice(message) {
  try {
    sessionStorage.setItem(AUTH_NOTICE_KEY, message);
  } catch {}
}

export { setAuthNotice };

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
  const bearerToken = getBearerToken();
  if (bearerToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: bearerToken ? "omit" : "same-origin",
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
  const email = getStoredEmail();
  const token = getBearerToken();
  if (token && email) {
    try {
      const { cognitoSignOut } = await import("./cognitoClient.js");
      cognitoSignOut(email);
    } catch {}
  }
  clearLocalSessionStorage();
}

export async function restoreSessionFromServer() {
  try {
    const res = await authFetch("/api/auth/session", { skipAuthRedirect: true });
    if (!res.ok) {
      clearLocalSessionStorage();
      return { authenticated: false, isAdmin: false };
    }
    const data = await res.json().catch(() => ({}));
    const sessionEmail = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
    if (sessionEmail.includes("@")) {
      setSession(sessionEmail);
      return { authenticated: true, email: sessionEmail, isAdmin: !!data.isAdmin };
    }
    clearLocalSessionStorage();
    return { authenticated: false, isAdmin: false };
  } catch {
    return { authenticated: false, isAdmin: false };
  }
}

export function isAuthenticated() {
  return !!getStoredEmail() && !!getBearerToken();
}

export function readAdminModePreference(isAdminUser) {
  if (!isAdminUser) return false;
  try {
    const saved = localStorage.getItem(ADMIN_MODE_KEY);
    if (saved === null) return true;
    return saved === "true";
  } catch {
    return true;
  }
}
