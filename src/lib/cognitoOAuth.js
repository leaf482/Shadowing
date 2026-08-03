import { persistCognitoTokens } from "./auth.js";

const PKCE_VERIFIER_KEY = "shadowing_oauth_pkce_verifier";
const REDIRECT_URI_KEY = "shadowing_oauth_redirect_uri";
const COOKIE_MAX_AGE_SECONDS = 10 * 60;

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(length = 48) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function oauthRedirectUri() {
  return `${window.location.origin}/`;
}

function sharedCookieDomain() {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "shadowingnetwork.com" || hostname === "www.shadowingnetwork.com") {
    return ".shadowingnetwork.com";
  }
  return "";
}

function setOAuthCookie(name, value) {
  const domain = sharedCookieDomain();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const domainPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}${domainPart}`;
}

function getOAuthCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

function clearOAuthCookie(name) {
  const domain = sharedCookieDomain();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const domainPart = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}${domainPart}`;
}

function storeOAuthState(verifier, redirectUri) {
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);
  setOAuthCookie(PKCE_VERIFIER_KEY, verifier);
  setOAuthCookie(REDIRECT_URI_KEY, redirectUri);
}

function consumeOAuthState() {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY) || getOAuthCookie(PKCE_VERIFIER_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY) || getOAuthCookie(REDIRECT_URI_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
  clearOAuthCookie(PKCE_VERIFIER_KEY);
  clearOAuthCookie(REDIRECT_URI_KEY);
  return { verifier, redirectUri };
}

function parseJwtPayload(token) {
  const segment = String(token || "").split(".")[1];
  if (!segment) return null;
  const json = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

function clearOAuthQueryParams() {
  const { pathname, hash } = window.location;
  window.history.replaceState({}, "", `${pathname}${hash || ""}`);
}

export function getOAuthConfig(cognitoConfig) {
  if (!cognitoConfig?.oauth?.enabled) return null;
  const { clientId, region, oauth } = cognitoConfig;
  if (!clientId || !region || !oauth?.domain) return null;
  return {
    clientId,
    region,
    domain: oauth.domain,
    redirectUri: oauthRedirectUri(),
  };
}

export async function startGoogleSignIn(cognitoConfig) {
  const config = getOAuthConfig(cognitoConfig);
  if (!config) throw new Error("Google sign-in is not configured.");

  const verifier = randomVerifier();
  storeOAuthState(verifier, config.redirectUri);
  const challenge = await sha256Base64Url(verifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: config.redirectUri,
    identity_provider: "Google",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.assign(
    `https://${config.domain}.auth.${config.region}.amazoncognito.com/oauth2/authorize?${params}`
  );
}

export async function tryCompleteOAuthSignIn(cognitoConfig) {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    clearOAuthQueryParams();
    return {
      ok: false,
      error: params.get("error_description") || error,
    };
  }

  const code = params.get("code");
  if (!code) return null;

  const config = getOAuthConfig(cognitoConfig);
  if (!config) {
    clearOAuthQueryParams();
    return { ok: false, error: "Google sign-in is not configured." };
  }

  const { verifier, redirectUri } = consumeOAuthState();
  if (!verifier) {
    clearOAuthQueryParams();
    return { ok: false, error: "Sign-in session expired. Please try again." };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri || config.redirectUri,
    code_verifier: verifier,
  });

  let response;
  try {
    response = await fetch(
      `https://${config.domain}.auth.${config.region}.amazoncognito.com/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
  } catch {
    clearOAuthQueryParams();
    return { ok: false, error: "Could not complete Google sign-in. Please try again." };
  }

  clearOAuthQueryParams();

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: "Could not complete Google sign-in. Please try again." };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error_description || payload.error || "Google sign-in failed.",
    };
  }

  const idToken = payload.id_token;
  const refreshToken = payload.refresh_token || "";
  const tokenPayload = parseJwtPayload(idToken);
  const email = String(tokenPayload?.email || "")
    .trim()
    .toLowerCase();

  if (!idToken || !email.includes("@")) {
    return { ok: false, error: "Google sign-in did not return a valid account." };
  }

  persistCognitoTokens({ email, idToken, refreshToken });
  return { ok: true, email };
}
