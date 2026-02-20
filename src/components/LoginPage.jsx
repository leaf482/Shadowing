import { useState } from "react";
import { isUWEmail, setSession } from "../lib/auth.js";

export default function LoginPage({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    if (!isUWEmail(trimmed)) {
      setError("Only UW email addresses are allowed (@uw.edu, @washington.edu).");
      return;
    }
    setSubmitting(true);
    if (setSession(trimmed)) {
      onSuccess();
    } else {
      setError("Could not save session. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <div className="login__inner card">
        <h1 className="login__title">Sign in</h1>
        <p className="login__subtitle muted">
          Use your UW email to access the clinic directory and shadowing tools.
        </p>

        <form className="login__form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@uw.edu"
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
