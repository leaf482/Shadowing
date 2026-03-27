import { useEffect, useState } from "react";
import { isUWEmail, setSession, consumeAuthNotice } from "../lib/auth.js";

export default function LoginPage({ onSuccess, onBack }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("credentials"); // "credentials" | "verify" | "forgot_request" | "forgot_reset"
  const [pendingEmail, setPendingEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(false);
  const [resendTimerId, setResendTimerId] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetResendCooldown, setResetResendCooldown] = useState(false);
  const [resetResendTimerId, setResetResendTimerId] = useState(null);

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (notice) setError(notice);
  }, []);

  useEffect(() => () => {
    if (resendTimerId) clearTimeout(resendTimerId);
    if (resetResendTimerId) clearTimeout(resetResendTimerId);
  }, [resendTimerId, resetResendTimerId]);

  const startResendCooldown = (seconds) => {
    setResendCooldown(true);
    if (resendTimerId) clearTimeout(resendTimerId);
    const timerId = setTimeout(() => {
      setResendCooldown(false);
      setResendTimerId(null);
    }, Math.max(1, seconds) * 1000);
    setResendTimerId(timerId);
  };

  const startResetResendCooldown = (seconds) => {
    setResetResendCooldown(true);
    if (resetResendTimerId) clearTimeout(resetResendTimerId);
    const timerId = setTimeout(() => {
      setResetResendCooldown(false);
      setResetResendTimerId(null);
    }, Math.max(1, seconds) * 1000);
    setResetResendTimerId(timerId);
  };

  const toErrorMessage = (data, fallback) => {
    const message = data?.error || fallback;
    if (data?.requestId) return `${message} (Ref: ${data.requestId})`;
    return message;
  };

  const passwordChecks = {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
  };

  const resetPasswordChecks = {
    minLength: newPassword.length >= 8,
    hasLetter: /[A-Za-z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isUWEmail(trimmedEmail)) {
      setError("Only .edu email addresses are allowed (e.g. yourname@uw.edu, yourname@plu.edu).");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (mode === "register") {
      if (!passwordChecks.hasLetter || !passwordChecks.hasNumber) {
        setError("Password must include both letters and numbers.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "register") {
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        const registerData = await registerRes.json().catch(() => ({}));
        if (!registerRes.ok) {
          setError(toErrorMessage(registerData, "Could not create account."));
          setSubmitting(false);
          return;
        }

        await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail }),
        }).catch(() => {});

        setPendingEmail(trimmedEmail);
        setStep("verify");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.status === 403) {
        const data = await res.json();
        if (data.error === "email_not_verified") {
          setPendingEmail(data.email || trimmedEmail);
          setStep("verify");
          setSubmitting(false);
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(toErrorMessage(data, "Invalid email or password."));
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      setSession(trimmedEmail);
      onSuccess();
    } catch {
      setError("Could not connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    if (!verifyCode.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(toErrorMessage(data, "Invalid code. Please try again."));
        setSubmitting(false);
        return;
      }
      setSession(pendingEmail);
      onSuccess();
    } catch {
      setError("Could not connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError("");
    startResendCooldown(30);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          startResendCooldown(data.retryAfterSeconds || 60);
        }
        setError(toErrorMessage(data, "Could not resend code. Please try again."));
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setError("");
    const trimmedEmail = resetEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isUWEmail(trimmedEmail)) {
      setError("Only .edu email addresses are allowed (e.g. yourname@uw.edu, yourname@plu.edu).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          startResetResendCooldown(data.retryAfterSeconds || 60);
        }
        setError(toErrorMessage(data, "Could not start password reset. Please try again."));
        setSubmitting(false);
        return;
      }

      setResetEmail(trimmedEmail);
      setStep("forgot_reset");
      startResetResendCooldown(30);
      setSubmitting(false);
    } catch {
      setError("Could not connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  const handleResendResetCode = async () => {
    setError("");
    startResetResendCooldown(30);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          startResetResendCooldown(data.retryAfterSeconds || 60);
        }
        setError(toErrorMessage(data, "Could not resend reset code. Please try again."));
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (!resetCode.trim()) {
      setError("Please enter the reset code.");
      return;
    }
    if (!resetPasswordChecks.minLength || !resetPasswordChecks.hasLetter || !resetPasswordChecks.hasNumber) {
      setError("Password must be at least 8 characters and include letters and numbers.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          code: resetCode.trim(),
          password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(toErrorMessage(data, "Could not reset password. Please try again."));
        setSubmitting(false);
        return;
      }

      setMode("login");
      setStep("credentials");
      setEmail(resetEmail);
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setError("Password updated. Please sign in with your new password.");
      setSubmitting(false);
    } catch {
      setError("Could not connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  if (step === "forgot_request") {
    return (
      <div className="login">
        <div className="login__inner card">
          <h1 className="login__title">Reset your password</h1>
          <p className="login__subtitle muted">
            Enter your university email address and we will send a reset code via email.
          </p>
          <form className="login__form" onSubmit={handleForgotRequest}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={submitting}
                className="login__input"
                autoFocus
              />
            </label>
            {error ? (
              <p className="login__error" role="alert">{error}</p>
            ) : null}
            <div className="login__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                }}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={submitting}
              >
                {submitting ? "Sending..." : "Send reset code"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === "forgot_reset") {
    return (
      <div className="login">
        <div className="login__inner card">
          <h1 className="login__title">Enter reset code</h1>
          <p className="login__subtitle muted">
            We sent a reset code to <strong>{resetEmail}</strong>. Enter it with your new password.
          </p>
          <form className="login__form" onSubmit={handleResetPassword}>
            <label>
              Reset code
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                disabled={submitting}
                className="login__input"
                autoFocus
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
                className="login__input"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="login__input"
              />
            </label>
            <ul className="login__password-checklist" aria-live="polite">
              <li className={resetPasswordChecks.minLength ? "is-valid" : ""}>
                <span>{resetPasswordChecks.minLength ? "✓" : "○"}</span>
                At least 8 characters
              </li>
              <li className={resetPasswordChecks.hasLetter ? "is-valid" : ""}>
                <span>{resetPasswordChecks.hasLetter ? "✓" : "○"}</span>
                Includes a letter (A-Z)
              </li>
              <li className={resetPasswordChecks.hasNumber ? "is-valid" : ""}>
                <span>{resetPasswordChecks.hasNumber ? "✓" : "○"}</span>
                Includes a number (0-9)
              </li>
            </ul>
            {error ? (
              <p className="login__error" role="alert">{error}</p>
            ) : null}
            <div className="login__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleResendResetCode}
                disabled={submitting || resetResendCooldown}
              >
                {resetResendCooldown ? "Code sent" : "Resend code"}
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={submitting}
              >
                {submitting ? "Updating..." : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="login">
        <div className="login__inner card">
          <h1 className="login__title">Check your email</h1>
          <p className="login__subtitle muted">
            We sent a 6-digit verification code to <strong>{pendingEmail}</strong>. Enter it below to continue.
          </p>
          <form className="login__form" onSubmit={handleVerify}>
            <label>
              Verification code
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                disabled={submitting}
                className="login__input"
                autoFocus
              />
            </label>
            {error ? (
              <p className="login__error" role="alert">{error}</p>
            ) : null}
            <div className="login__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleResend}
                disabled={submitting || resendCooldown}
              >
                {resendCooldown ? "Code sent" : "Resend code"}
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={submitting}
              >
                {submitting ? "Verifying…" : "Verify"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`login ${mode === "register" ? "login--register" : ""}`}>
      <div className="login__inner card">
        <div className="login__mode-switch" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={mode === "login" ? "login__mode-btn is-active" : "login__mode-btn"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
            disabled={submitting}
            aria-selected={mode === "login"}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "register" ? "login__mode-btn is-active" : "login__mode-btn"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
            disabled={submitting}
            aria-selected={mode === "register"}
          >
            Create account
          </button>
        </div>

        {mode === "register" && (
          <p className="login__mode-badge" aria-live="polite">New account setup</p>
        )}

        <h1 className="login__title">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="login__subtitle muted">
          {mode === "login"
            ? "Use your university .edu email to access the clinic directory and shadowing tools."
            : "Create your Shadow Network account with a university .edu email. We'll send a verification code before first access."}
        </p>

        <form className="login__form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              disabled={submitting}
              className="login__input"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="login__input"
            />
          </label>
          {mode === "login" && (
            <p className="muted small" style={{ margin: "-0.2rem 0 0.4rem", textAlign: "right" }}>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setResetEmail(email.trim().toLowerCase());
                  setResetCode("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setStep("forgot_request");
                  setError("");
                }}
                disabled={submitting}
              >
                Forgot password?
              </button>
            </p>
          )}
          {mode === "register" && (
            <ul className="login__password-checklist" aria-live="polite">
              <li className={passwordChecks.minLength ? "is-valid" : ""}>
                <span>{passwordChecks.minLength ? "✓" : "○"}</span>
                At least 8 characters
              </li>
              <li className={passwordChecks.hasLetter ? "is-valid" : ""}>
                <span>{passwordChecks.hasLetter ? "✓" : "○"}</span>
                Includes a letter (A-Z)
              </li>
              <li className={passwordChecks.hasNumber ? "is-valid" : ""}>
                <span>{passwordChecks.hasNumber ? "✓" : "○"}</span>
                Includes a number (0-9)
              </li>
            </ul>
          )}
          {error ? (
            <p className="login__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="login__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={onBack}
              disabled={submitting}
            >
              Back
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={submitting}
            >
              {submitting
                ? mode === "login" ? "Signing in..." : "Creating account..."
                : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </div>
        </form>

        <p className="muted small" style={{ marginTop: "0.9rem", textAlign: "center" }}>
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode((prev) => (prev === "login" ? "register" : "login"));
              setError("");
            }}
            disabled={submitting}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
