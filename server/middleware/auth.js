import { randomBytes } from "crypto";
import { isCognitoAuthEnabled, getUserIdFromCognitoAccessToken } from "../cognitoAuth.js";
import { isAdminUser } from "../lib/admin.js";
import { sendError } from "../lib/http.js";
import { SESSION_COOKIE_NAME, SESSION_REFRESH_THRESHOLD_MS, SESSION_TTL_MS } from "../lib/env.js";

function parseCookies(req) {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return {};

  return rawCookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return acc;
      const key = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function createAuthHelpers(repos) {
  function getSessionToken(req) {
    const cookies = parseCookies(req);
    const primary = cookies[SESSION_COOKIE_NAME];
    if (primary) return primary;
    if (process.env.NODE_ENV === "production" && cookies.shadowing_session) {
      return cookies.shadowing_session;
    }
    return null;
  }

  function setSessionCookie(res, token) {
    const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`
    );
    if (process.env.NODE_ENV === "production" && SESSION_COOKIE_NAME !== "shadowing_session") {
      res.appendHeader(
        "Set-Cookie",
        `shadowing_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
      );
    }
  }

  function clearSessionCookie(res) {
    const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
    );
    if (process.env.NODE_ENV === "production" && SESSION_COOKIE_NAME !== "shadowing_session") {
      res.appendHeader(
        "Set-Cookie",
        `shadowing_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
      );
    }
  }

  async function issueSession(userId, res) {
    const token = randomBytes(32).toString("hex");
    await repos.authSessions.insert(token, userId, new Date().toISOString());
    setSessionCookie(res, token);
    return token;
  }

  async function getUserIdFromToken(req) {
    if (isCognitoAuthEnabled()) {
      return getUserIdFromCognitoAccessToken(req);
    }

    const token = getSessionToken(req);
    if (!token) return null;
    const row = await repos.authSessions.findByToken(token);
    if (!row) return null;

    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > SESSION_TTL_MS) {
      await repos.authSessions.deleteByToken(token);
      return null;
    }

    if (age > SESSION_REFRESH_THRESHOLD_MS && req.res) {
      await repos.authSessions.updateCreatedAt(token, new Date().toISOString());
      setSessionCookie(req.res, token);
    }

    return row.user_id;
  }

  async function requireAdmin(req, res) {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      sendError(req, res, 401, "Unauthorized");
      return null;
    }
    if (!isAdminUser(userId)) {
      sendError(req, res, 403, "Admin access required.");
      return null;
    }
    return userId;
  }

  return {
    getSessionToken,
    setSessionCookie,
    clearSessionCookie,
    issueSession,
    getUserIdFromToken,
    requireAdmin,
    isAdminUser,
  };
}
