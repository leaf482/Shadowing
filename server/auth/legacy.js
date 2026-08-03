import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
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

async function sendAuthEmail({ to, subject, html, purpose }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "Shadow Network <noreply@shadowingnetwork.com>";
  if (!apiKey) {
    const reason = "missing_resend_api_key";
    logAuthEvent(`${purpose}_email_skipped`, { email: maskEmail(to), reason });
    return process.env.NODE_ENV === "production" && process.env.CI !== "true"
      ? { sent: false, reason }
      : { sent: true, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      logAuthEvent(`${purpose}_email_failed`, {
        email: maskEmail(to),
        providerStatus: response.status,
        providerBody: body.slice(0, 300),
      });
      return { sent: false, reason: "provider_error", providerStatus: response.status };
    }

    let providerId = null;
    try {
      providerId = JSON.parse(body)?.id ?? null;
    } catch {
      providerId = null;
    }
    logAuthEvent(`${purpose}_email_sent`, { email: maskEmail(to), providerId });
  } catch (error) {
    logAuthEvent(`${purpose}_email_failed`, {
      email: maskEmail(to),
      reason: "provider_exception",
      message: error?.message || "unknown",
    });
    return { sent: false, reason: "provider_exception" };
  }

  return { sent: true };
}

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuf, derived);
};

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

  async function sendVerificationCode(email, options = {}) {
  const { enforceResendCooldown = false } = options;
  const existing = await repos.users.findVerificationSentAt(email);

  if (!existing) {
    return { sent: false, reason: "user_not_found" };
  }

  if (enforceResendCooldown && existing.verification_sent_at) {
    const elapsed = Date.now() - new Date(existing.verification_sent_at).getTime();
    if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
      const retryAfterMs = Math.max(0, VERIFICATION_RESEND_COOLDOWN_MS - elapsed);
      return { sent: false, reason: "resend_cooldown", retryAfterMs };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  await repos.users.updateVerificationSend(email, code, expiresAt, nowIso);

  const delivery = await sendAuthEmail({
    to: email,
    subject: "Your Shadow Network verification code",
    purpose: "verification",
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Enter this code to complete sign-in:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;padding:1rem;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#888;font-size:0.875rem">Expires in 10 minutes. If you did not request this, ignore this email.</p>
        </div>
      `,
  });

  if (!delivery.sent) return delivery;

  return { sent: true };
  }

  async function sendPasswordResetCode(email, options = {}) {
  const { enforceResendCooldown = false } = options;
  const existing = await repos.users.findPasswordResetSentAt(email);

  if (!existing) {
    return { sent: false, reason: "user_not_found" };
  }

  if (enforceResendCooldown && existing.password_reset_sent_at) {
    const elapsed = Date.now() - new Date(existing.password_reset_sent_at).getTime();
    if (elapsed < PASSWORD_RESET_RESEND_COOLDOWN_MS) {
      const retryAfterMs = Math.max(0, PASSWORD_RESET_RESEND_COOLDOWN_MS - elapsed);
      return { sent: false, reason: "resend_cooldown", retryAfterMs };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  await repos.users.updatePasswordResetSend(email, code, expiresAt, nowIso);

  const delivery = await sendAuthEmail({
    to: email,
    subject: "Shadow Network password reset code",
    purpose: "password_reset",
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Reset your password</h2>
          <p>Use this code to reset your Shadow Network password:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.25em;padding:1rem;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#888;font-size:0.875rem">This code expires in 10 minutes. If you did not request a password reset, you can safely ignore this email.</p>
        </div>
      `,
  });

  if (!delivery.sent) return delivery;

  return { sent: true };
  }

  router.post("/register", async (req, res) => {
  if (isCognitoAuthEnabled()) {
    sendError(req, res, 410, "Sign up is handled by Amazon Cognito. Use the registration form in the app.");
    return;
  }
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    sendError(req, res, 400, "Email and password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    sendError(req, res, 400, "Password must be at least 8 characters.");
    return;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    sendError(req, res, 400, "Password must include both letters and numbers.");
    return;
  }
  if (password.length > 128) {
    sendError(req, res, 400, "Password is too long.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await repos.users.existsEmail(normalizedEmail);
  if (existing) {
    logAuthEventForRequest(req, "register_conflict", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 409, "An account with this email already exists.");
    return;
  }

  const passwordHash = hashPassword(password);
  await repos.users.insert(normalizedEmail, passwordHash);

  const sendResult = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: false });
  if (!sendResult.sent) {
    logAuthEventForRequest(req, "register_verification_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: sendResult.reason || "unknown",
    });
    sendError(
      req,
      res,
      502,
      "Account was created but we could not send a verification email. Use “Resend code” to try again."
    );
    return;
  }

  logAuthEventForRequest(req, "register_success", { email: maskEmail(normalizedEmail) });

  res.status(201).json({ email: normalizedEmail, verificationSent: true });
});

router.post("/login", async (req, res) => {
  if (isCognitoAuthEnabled()) {
    sendError(req, res, 410, "Sign in is handled by Amazon Cognito.");
    return;
  }
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    sendError(req, res, 400, "Email and password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }

  const now = Date.now();
  const ipKey = loginRateLimitKey("ip", req.ip || "unknown");
  const normalizedEmail = email.trim().toLowerCase();
  const accountKey = loginRateLimitKey("account", normalizedEmail);

  if (
    (await repos.rateLimits.isRateLimited(
      ipKey,
      LOGIN_MAX_ATTEMPTS_PER_IP,
      LOGIN_RATE_WINDOW_MS,
      now
    )) ||
    (await repos.rateLimits.isRateLimited(
      accountKey,
      LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
      LOGIN_RATE_WINDOW_MS,
      now
    ))
  ) {
    logAuthEventForRequest(req, "login_rate_limited", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many login attempts. Try again in 10 minutes.");
    return;
  }

  const user = await repos.users.findForLogin(normalizedEmail);

  if (!user) {
    await repos.rateLimits.recordFailedAttempt(ipKey, LOGIN_RATE_WINDOW_MS, now);
    await repos.rateLimits.recordFailedAttempt(accountKey, LOGIN_RATE_WINDOW_MS, now);
    logAuthEventForRequest(req, "login_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 401, "Invalid email or password.");
    return;
  }

  const passwordHash = user.password_hash;

  if (!verifyPassword(password, passwordHash)) {
    await repos.rateLimits.recordFailedAttempt(ipKey, LOGIN_RATE_WINDOW_MS, now);
    await repos.rateLimits.recordFailedAttempt(accountKey, LOGIN_RATE_WINDOW_MS, now);
    logAuthEventForRequest(req, "login_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 401, "Invalid email or password.");
    return;
  }

  await repos.rateLimits.clear(accountKey);

  if (!Number(user?.is_verified)) {
    const sendResult = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
    if (!sendResult.sent && sendResult.reason !== "resend_cooldown") {
      logAuthEventForRequest(req, "login_verification_send_failed", {
        email: maskEmail(normalizedEmail),
        reason: sendResult.reason || "unknown",
      });
      sendError(req, res, 502, "Could not send verification email. Please try again shortly.");
      return;
    }
    logAuthEventForRequest(req, "login_unverified", {
      email: maskEmail(normalizedEmail),
      verificationSent: sendResult.sent,
      verificationReason: sendResult.reason || null,
    });
    sendError(req, res, 403, "email_not_verified", { email: normalizedEmail });
    return;
  }

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "login_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});
router.post("/send-verification", async (req, res) => {
  if (rejectLegacyAuthRoute(req, res)) return;
  const { email } = req.body ?? {};
  if (!email || !isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email is required.");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.existsEmail(normalizedEmail);

  // Always return a generic success envelope to avoid account enumeration.
  if (!user) {
    logAuthEventForRequest(req, "verification_send_unknown_account", { email: maskEmail(normalizedEmail) });
    res.json({ ok: true });
    return;
  }

  const result = await sendVerificationCode(normalizedEmail, { enforceResendCooldown: true });
  if (!result.sent && result.reason === "resend_cooldown") {
    logAuthEventForRequest(req, "verification_send_cooldown", { email: maskEmail(normalizedEmail) });
    sendError(
      req,
      res,
      429,
      "Please wait before requesting another verification code.",
      { retryAfterSeconds: Math.ceil((result.retryAfterMs ?? 0) / 1000) }
    );
    return;
  }
  if (!result.sent) {
    logAuthEventForRequest(req, "verification_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: result.reason || "unknown",
    });
    sendError(req, res, 502, "Could not send verification email. Please try again shortly.");
    return;
  }

  logAuthEventForRequest(req, "verification_send", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

router.post("/verify", async (req, res) => {
  if (rejectLegacyAuthRoute(req, res)) return;
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    sendError(req, res, 400, "Email and code are required.");
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findVerificationState(normalizedEmail);

  if (user?.verification_locked_until && new Date(user.verification_locked_until) > new Date()) {
    logAuthEventForRequest(req, "verification_locked", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many failed attempts. Please try again later.");
    return;
  }

  if (!user || user.verification_code !== String(code).trim()) {
    if (user) {
      const nextAttempts = (user.verification_attempts ?? 0) + 1;
      if (nextAttempts >= VERIFICATION_MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + VERIFICATION_LOCK_MS).toISOString();
        await repos.users.setVerificationAttemptsLock(normalizedEmail, nextAttempts, lockUntil);
        logAuthEventForRequest(req, "verification_locked_due_to_attempts", { email: maskEmail(normalizedEmail) });
      } else {
        await repos.users.bumpVerificationAttempts(normalizedEmail, nextAttempts);
      }
    }
    logAuthEventForRequest(req, "verification_failed", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid verification code.");
    return;
  }
  if (new Date(user.verification_expires_at) < new Date()) {
    logAuthEventForRequest(req, "verification_expired", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Code has expired. Please request a new one.");
    return;
  }

  await repos.users.verifySuccess(normalizedEmail);

  await issueSession(normalizedEmail, res);
  logAuthEventForRequest(req, "verification_success", { email: maskEmail(normalizedEmail) });
  res.json({ email: normalizedEmail });
});

router.post("/forgot-password", async (req, res) => {
  if (rejectLegacyAuthRoute(req, res)) return;
  const { email } = req.body ?? {};
  if (!email || !isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email is required.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findForLogin(normalizedEmail);

  // Generic success response to avoid account enumeration.
  if (!user || !Number(user.is_verified)) {
    logAuthEventForRequest(req, "password_reset_request_ignored", { email: maskEmail(normalizedEmail) });
    res.json({ ok: true });
    return;
  }

  const result = await sendPasswordResetCode(normalizedEmail, { enforceResendCooldown: true });
  if (!result.sent && result.reason === "resend_cooldown") {
    logAuthEventForRequest(req, "password_reset_cooldown", { email: maskEmail(normalizedEmail) });
    sendError(
      req,
      res,
      429,
      "Please wait before requesting another reset code.",
      { retryAfterSeconds: Math.ceil((result.retryAfterMs ?? 0) / 1000) }
    );
    return;
  }
  if (!result.sent) {
    logAuthEventForRequest(req, "password_reset_send_failed", {
      email: maskEmail(normalizedEmail),
      reason: result.reason || "unknown",
    });
    sendError(req, res, 502, "Could not send password reset email. Please try again shortly.");
    return;
  }

  logAuthEventForRequest(req, "password_reset_requested", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});

router.post("/reset-password", async (req, res) => {
  if (rejectLegacyAuthRoute(req, res)) return;
  const { email, code, password } = req.body ?? {};
  if (!email || !code || !password) {
    sendError(req, res, 400, "Email, code, and new password are required.");
    return;
  }
  if (!isValidEduEmail(email)) {
    sendError(req, res, 400, "A valid .edu email address is required.");
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    sendError(req, res, 400, "Password must be at least 8 characters.");
    return;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    sendError(req, res, 400, "Password must include both letters and numbers.");
    return;
  }
  if (password.length > 128) {
    sendError(req, res, 400, "Password is too long.");
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await repos.users.findPasswordResetState(normalizedEmail);

  if (!user) {
    logAuthEventForRequest(req, "password_reset_failed_unknown_user", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid reset code.");
    return;
  }

  if (user.password_reset_locked_until && new Date(user.password_reset_locked_until) > new Date()) {
    logAuthEventForRequest(req, "password_reset_locked", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 429, "Too many failed attempts. Please try again later.");
    return;
  }

  if (!user.password_reset_code || user.password_reset_code !== String(code).trim()) {
    const nextAttempts = (user.password_reset_attempts ?? 0) + 1;
    if (nextAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + PASSWORD_RESET_LOCK_MS).toISOString();
      await repos.users.setPasswordResetAttemptsLock(normalizedEmail, nextAttempts, lockUntil);
      logAuthEventForRequest(req, "password_reset_locked_due_to_attempts", { email: maskEmail(normalizedEmail) });
    } else {
      await repos.users.bumpPasswordResetAttempts(normalizedEmail, nextAttempts);
    }
    logAuthEventForRequest(req, "password_reset_failed_invalid_code", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Invalid reset code.");
    return;
  }

  if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
    logAuthEventForRequest(req, "password_reset_expired", { email: maskEmail(normalizedEmail) });
    sendError(req, res, 400, "Reset code has expired. Please request a new one.");
    return;
  }

  const passwordHash = hashPassword(password);
  await repos.users.updatePasswordClearReset(normalizedEmail, passwordHash);

  await repos.authSessions.deleteAllForUser(normalizedEmail);

  logAuthEventForRequest(req, "password_reset_success", { email: maskEmail(normalizedEmail) });
  res.json({ ok: true });
});
}
