import { useEffect, useState } from "react";
import { isUWEmail, setSession, consumeAuthNotice } from "../lib/auth.js";

export default function LoginPage({ onSuccess, onBack }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("credentials"); // "credentials" | "verify"
  const [pendingEmail, setPendingEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(false);
  const [resendTimerId, setResendTimerId] = useState(null);

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (notice) setError(notice);
  }, []);

  const startResendCooldown = (seconds) => {
    setResendCooldown(true);
    if (resendTimerId) clearTimeout(resendTimerId);
    const timerId = setTimeout(() => {
      setResendCooldown(false);
      setResendTimerId(null);
    }, Math.max(1, seconds) * 1000);
    setResendTimerId(timerId);
  };

  const toErrorMessage = (data, fallback) => {
    const message = data?.error || fallback;
    if (data?.requestId) return `${message} (Ref: ${data.requestId})`;
    return message;
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
    <div className="login">
      <div className="login__inner card">
        <h1 className="login__title">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="login__subtitle muted">
          Use your university .edu email to access the clinic directory and shadowing tools.
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
