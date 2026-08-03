import { Router } from "express";
import { getCognitoPublicConfig, isCognitoAuthEnabled } from "../cognitoAuth.js";
import { logAuthEventForRequest } from "../lib/authLogging.js";
import { registerLegacyAuthRoutes } from "../auth/legacy.js";

export function registerAuthRoutes(app, deps) {
  const {
    getUserIdFromToken,
    getSessionToken,
    clearSessionCookie,
    isAdminUser,
    issueSession,
    repos,
  } = deps;

  app.get("/api/auth/config", (_req, res) => {
    const cognito = getCognitoPublicConfig();
    res.json({
      authMode: cognito ? "cognito" : "legacy",
      cognito,
    });
  });

  app.delete("/api/auth/logout", async (req, res) => {
    if (isCognitoAuthEnabled()) {
      res.json({ ok: true });
      return;
    }
    const token = getSessionToken(req);
    if (token) {
      await repos.authSessions.deleteByToken(token);
    }
    clearSessionCookie(res);
    logAuthEventForRequest(req, "logout", { hadSession: !!token });
    res.json({ ok: true });
  });

  app.get("/api/auth/session", async (req, res) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      if (!isCognitoAuthEnabled()) {
        clearSessionCookie(res);
      }
      res.status(401).json({ authenticated: false, requestId: req.requestId || "unknown" });
      return;
    }
    res.json({ authenticated: true, email: userId, isAdmin: isAdminUser(userId) });
  });

  const legacyRouter = Router();
  registerLegacyAuthRoutes(legacyRouter, {
    repos,
    issueSession,
    getSessionToken,
    clearSessionCookie,
  });
  app.use("/api/auth", legacyRouter);
}
