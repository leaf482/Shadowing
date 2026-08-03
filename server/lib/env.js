export function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const COOLDOWN_DAYS = Math.min(21, Math.max(14, parseInt(process.env.COOLDOWN_DAYS, 10) || 14));
export const MAX_ACTIVE_RESERVES = 3;

export const VERIFICATION_TTL_MS = clamp(envInt("VERIFICATION_TTL_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
export const VERIFICATION_RESEND_COOLDOWN_MS = clamp(envInt("VERIFICATION_RESEND_COOLDOWN_MS", 60 * 1000), 10 * 1000, 10 * 60 * 1000);
export const VERIFICATION_MAX_ATTEMPTS = clamp(envInt("VERIFICATION_MAX_ATTEMPTS", 5), 3, 10);
export const VERIFICATION_LOCK_MS = clamp(envInt("VERIFICATION_LOCK_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);

export const PASSWORD_RESET_TTL_MS = clamp(envInt("PASSWORD_RESET_TTL_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = clamp(envInt("PASSWORD_RESET_RESEND_COOLDOWN_MS", 60 * 1000), 10 * 1000, 10 * 60 * 1000);
export const PASSWORD_RESET_MAX_ATTEMPTS = clamp(envInt("PASSWORD_RESET_MAX_ATTEMPTS", 5), 3, 10);
export const PASSWORD_RESET_LOCK_MS = clamp(envInt("PASSWORD_RESET_LOCK_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);

export const SESSION_TTL_MS = clamp(envInt("SESSION_TTL_MS", 7 * 24 * 60 * 60 * 1000), 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000);
export const SESSION_REFRESH_THRESHOLD_MS = clamp(
  envInt("SESSION_REFRESH_THRESHOLD_MS", 24 * 60 * 60 * 1000),
  5 * 60 * 1000,
  SESSION_TTL_MS
);

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-shadowing_session"
    : "shadowing_session";

export const LOGIN_RATE_WINDOW_MS = clamp(envInt("LOGIN_RATE_WINDOW_MS", 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
export const LOGIN_MAX_ATTEMPTS_PER_IP = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_IP", 10), 3, 100);
export const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = clamp(envInt("LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 10), 3, 100);

export const AUTH_LOGGING_ENABLED = process.env.AUTH_LOGGING_ENABLED !== "false";

export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export const API_GATEWAY_STAGE = (process.env.API_GATEWAY_STAGE || "").trim();
export const PORT = process.env.PORT || 3000;
