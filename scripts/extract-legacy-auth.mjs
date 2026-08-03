import fs from "node:fs";
import path from "node:path";

const lines = fs.readFileSync(path.join(import.meta.dirname, "..", "server/createApp.js"), "utf8").split("\n");

const helpers = [
  ...lines.slice(46, 99),
  "",
  "function hashPassword(password) {",
  ...lines.slice(147, 158),
  "}",
  "",
  "function verifyPassword(password, stored) {",
  ...lines.slice(152, 158),
  "}",
].join("\n");

// Fix duplicate - read hash/verify from createApp properly
const hashBlock = lines.slice(146, 159).join("\n");

const innerHelpers = lines.slice(1346, 1427).join("\n");
const routeBlock = [...lines.slice(1167, 1311), ...lines.slice(1428, 1624)].join("\n");
const routes = routeBlock.replace(/app\.(get|post|put|delete)\("\/api\/auth/g, 'router.$1("');

const out = `import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import {
  VERIFICATION_TTL_MS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_LOCK_MS,
  PASSWORD_RESET_TTL_MS,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_LOCK_MS,
  LOGIN_RATE_WINDOW_MS,
  LOGIN_MAX_ATTEMPTS_PER_IP,
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
} from "../lib/env.js";
import { sendError } from "../lib/http.js";
import { isValidEduEmail } from "../lib/eduEmail.js";
import {
  loginRateLimitKey,
  maskEmail,
  logAuthEvent,
  logAuthEventForRequest,
} from "../lib/authLogging.js";
import { isCognitoAuthEnabled } from "../cognitoAuth.js";

${lines.slice(46, 99).join("\n")}

${hashBlock}

${innerHelpers}

function rejectLegacyAuthRoute(req, res) {
  if (!isCognitoAuthEnabled()) return false;
  sendError(req, res, 410, "This sign-in method is disabled. Use Amazon Cognito.");
  return true;
}

export function registerLegacyAuthRoutes(router, deps) {
  const {
    repos,
    issueSession,
    getSessionToken,
    clearSessionCookie,
  } = deps;

${routes}
}
`;

fs.writeFileSync(path.join(import.meta.dirname, "..", "server/auth/legacy.js"), out);
console.log("wrote server/auth/legacy.js");
