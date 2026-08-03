import { AUTH_LOGGING_ENABLED } from "./env.js";

export function loginRateLimitKey(kind, value) {
  return `login:${kind}:${value}`;
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return "unknown";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "unknown";
  const safeLocal = localPart.length <= 2
    ? `${localPart[0] || "*"}*`
    : `${localPart.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}

export function logAuthEvent(event, details = {}) {
  if (!AUTH_LOGGING_ENABLED) return;
  const payload = { event, at: new Date().toISOString(), ...details };
  console.info("[auth]", JSON.stringify(payload));
}

export function authRequestMeta(req, details = {}) {
  return {
    requestId: req.requestId || "unknown",
    ip: req.ip || "unknown",
    ...details,
  };
}

export function logAuthEventForRequest(req, event, details = {}) {
  logAuthEvent(event, authRequestMeta(req, details));
}
