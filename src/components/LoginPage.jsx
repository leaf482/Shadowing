import { useState } from "react";
import { isUWEmail, setSession } from "../lib/auth.js";

export default function LoginPage({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      let res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.status === 401) {
        // Account doesn't exist yet — auto-register then log in
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        if (!regRes.ok) {
          const regErr = await regRes.json();
          setError(regErr.error || "Could not create account.");
          setSubmitting(false);
          return;
        }
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Invalid email or password.");
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      setSession(trimmedEmail, data.token);
      onSuccess();
    } catch {
      setError("Could not connect to server. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login__inner card">
        <h1 className="login__title">Sign in</h1>
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
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
