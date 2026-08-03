import { useEffect, useState } from "react";
import {
  consumeAuthNotice,
  initCognitoAuth,
  isEduEmail,
  signInWithPassword,
} from "../lib/auth.js";
import {
  cognitoConfirmPassword,
  cognitoConfirmSignUp,
  cognitoErrorMessage,
  cognitoForgotPassword,
  cognitoResendSignUpCode,
  cognitoSignUp,
} from "../lib/cognitoClient.js";
import { useResendCooldown } from "../hooks/useResendCooldown.js";
import { getPasswordChecks, isPasswordValid } from "../lib/passwordRules.js";
import LoginShell from "./auth/LoginShell.jsx";
import PasswordChecklist from "./auth/PasswordChecklist.jsx";
import GoogleSignInButton from "./auth/GoogleSignInButton.jsx";

const EDU_EMAIL_ERROR = "Only .edu email addresses are allowed (e.g. yourname@uw.edu, yourname@plu.edu).";

export default function LoginPage({ onSuccess, onBack }) {
  const [ready, setReady] = useState(false);
  const [cognitoConfig, setCognitoConfig] = useState(null);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("credentials");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const verifyResend = useResendCooldown();
  const resetResend = useResendCooldown();

  useEffect(() => {
    initCognitoAuth().then(({ ok, config }) => {
      if (!ok) setError("Sign-in is not configured. Please try again later.");
      else setCognitoConfig(config?.cognito || null);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const notice = consumeAuthNotice();
    if (notice) setError(notice);
  }, []);

  const passwordChecks = getPasswordChecks(password);
  const resetPasswordChecks = getPasswordChecks(newPassword);

  const completeSignIn = async (trimmedEmail, userPassword) => {
    await signInWithPassword(trimmedEmail, userPassword);
    await onSuccess();
  };

  const goToVerify = (trimmedEmail, userPassword) => {
    setPendingEmail(trimmedEmail);
    setPendingPassword(userPassword);
    setStep("verify");
  };

  const googleSignInEnabled = !!cognitoConfig?.oauth?.enabled;

  const handleGoogleSignIn = async () => {
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const { startGoogleSignIn } = await import("../lib/cognitoOAuth.js");
      await startGoogleSignIn(cognitoConfig);
    } catch (err) {
      setError(err?.message || "Could not start Google sign-in.");
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isEduEmail(trimmedEmail)) {
      setError(EDU_EMAIL_ERROR);
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mode === "register" && !isPasswordValid(passwordChecks)) {
      setError("Password must include both letters and numbers.");
      return;
    }
    if (mode === "register" && password !== registerConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "register") {
        await cognitoSignUp(trimmedEmail, password);
        goToVerify(trimmedEmail, password);
        setSubmitting(false);
        return;
      }

      try {
        await completeSignIn(trimmedEmail, password);
      } catch (err) {
        if (err?.code === "UserNotConfirmedException") {
          goToVerify(trimmedEmail, password);
          setSubmitting(false);
          return;
        }
        setError(cognitoErrorMessage(err, "Invalid email or password."));
        setSubmitting(false);
      }
    } catch (err) {
      setError(cognitoErrorMessage(err, "Something went wrong. Please try again."));
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
    if (!pendingPassword) {
      setError("Please enter your password again to finish signing in.");
      return;
    }
    setSubmitting(true);
    try {
      await cognitoConfirmSignUp(pendingEmail, verifyCode.trim());
      await completeSignIn(pendingEmail, pendingPassword);
    } catch (err) {
      setError(cognitoErrorMessage(err, "Invalid code. Please try again."));
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await cognitoResendSignUpCode(pendingEmail);
      verifyResend.start();
    } catch (err) {
      setError(cognitoErrorMessage(err, "Could not resend code. Please try again."));
    }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const trimmedEmail = resetEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!isEduEmail(trimmedEmail)) {
      setError("Only .edu email addresses are allowed.");
      return;
    }

    setSubmitting(true);
    try {
      await cognitoForgotPassword(trimmedEmail);
      setResetEmail(trimmedEmail);
      setStep("forgot_reset");
      resetResend.start();
      setSubmitting(false);
    } catch (err) {
      setError(cognitoErrorMessage(err, "Could not start password reset. Please try again."));
      setSubmitting(false);
    }
  };

  const handleResendResetCode = async () => {
    setError("");
    try {
      await cognitoForgotPassword(resetEmail);
      resetResend.start();
    } catch (err) {
      setError(cognitoErrorMessage(err, "Could not resend reset code. Please try again."));
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!resetCode.trim()) {
      setError("Please enter the reset code.");
      return;
    }
    if (!isPasswordValid(resetPasswordChecks)) {
      setError("Password must be at least 8 characters and include letters and numbers.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await cognitoConfirmPassword(resetEmail, resetCode.trim(), newPassword);
      setMode("login");
      setStep("credentials");
      setEmail(resetEmail);
      setPassword("");
      setRegisterConfirmPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess("Password updated. Please sign in with your new password.");
      setSubmitting(false);
    } catch (err) {
      setError(cognitoErrorMessage(err, "Could not reset password. Please try again."));
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <LoginShell>
        <p className="muted">Loading sign-in…</p>
      </LoginShell>
    );
  }

  if (step === "forgot_request") {
    return (
      <LoginShell>
        <h1 className="login__title">Reset your password</h1>
        <p className="login__subtitle muted">Enter your .edu email and we will send a reset code.</p>
        <form className="login__form" onSubmit={handleForgotRequest}>
          <label>
            Email address
            <input type="email" autoComplete="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} disabled={submitting} className="login__input" autoFocus />
          </label>
          {error ? <p className="login__error" role="alert">{error}</p> : null}
          <div className="login__actions">
            <button type="button" className="button button--secondary" onClick={() => { setStep("credentials"); setError(""); }} disabled={submitting}>Back</button>
            <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? "Sending..." : "Send reset code"}</button>
          </div>
        </form>
      </LoginShell>
    );
  }

  if (step === "forgot_reset") {
    return (
      <LoginShell>
        <h1 className="login__title">Enter reset code</h1>
        <p className="login__subtitle muted">We sent a reset code to <strong>{resetEmail}</strong>.</p>
        <form className="login__form" onSubmit={handleResetPassword}>
          <label>Reset code<input type="text" inputMode="numeric" autoComplete="one-time-code" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\s/g, ""))} disabled={submitting} className="login__input" autoFocus /></label>
          <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={submitting} className="login__input" /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} className="login__input" /></label>
          <PasswordChecklist checks={resetPasswordChecks} />
          {error ? <p className="login__error" role="alert">{error}</p> : null}
          <div className="login__actions">
            <button type="button" className="button button--secondary" onClick={() => { setStep("forgot_request"); setError(""); }} disabled={submitting}>Back</button>
            <button type="button" className="button button--secondary" onClick={handleResendResetCode} disabled={submitting || resetResend.active}>{resetResend.active ? "Code sent" : "Resend code"}</button>
            <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? "Updating..." : "Update password"}</button>
          </div>
        </form>
      </LoginShell>
    );
  }

  if (step === "verify") {
    return (
      <LoginShell>
        <h1 className="login__title">Check your email</h1>
        <p className="login__subtitle muted">We sent a verification code to <strong>{pendingEmail}</strong>.</p>
        <form className="login__form" onSubmit={handleVerify}>
          <label>Verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\s/g, ""))} disabled={submitting} className="login__input" autoFocus /></label>
          {!pendingPassword ? (
            <label>
              Password
              <input type="password" autoComplete="current-password" value={pendingPassword} onChange={(e) => setPendingPassword(e.target.value)} disabled={submitting} className="login__input" />
            </label>
          ) : null}
          {error ? <p className="login__error" role="alert">{error}</p> : null}
          <div className="login__actions">
            <button type="button" className="button button--secondary" onClick={() => { setStep("credentials"); setError(""); }} disabled={submitting}>Back</button>
            <button type="button" className="button button--secondary" onClick={handleResend} disabled={submitting || verifyResend.active}>{verifyResend.active ? "Code sent" : "Resend code"}</button>
            <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? "Verifying…" : "Verify"}</button>
          </div>
        </form>
      </LoginShell>
    );
  }

  return (
    <LoginShell className={mode === "register" ? "login--register" : ""}>
      <div className="login__mode-switch" role="tablist" aria-label="Auth mode">
        <button type="button" className={mode === "login" ? "login__mode-btn is-active" : "login__mode-btn"} onClick={() => { setMode("login"); setRegisterConfirmPassword(""); setError(""); setSuccess(""); }} disabled={submitting} aria-selected={mode === "login"}>Sign in</button>
        <button type="button" className={mode === "register" ? "login__mode-btn is-active" : "login__mode-btn"} onClick={() => { setMode("register"); setError(""); setSuccess(""); }} disabled={submitting} aria-selected={mode === "register"}>Create account</button>
      </div>
      <h1 className="login__title">{mode === "login" ? "Sign in" : "Create account"}</h1>
      <p className="login__subtitle muted">
        {mode === "login"
          ? "Sign in with your .edu email and password, or use your university Google account."
          : "Create an account with your .edu email. We will send a verification code, or use Google with a .edu account."}
      </p>
      <form className="login__form" onSubmit={handleSubmit}>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting} className="login__input" /></label>
        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={submitting} className="login__input" /></label>
        {mode === "register" && (
          <label>Confirm password<input type="password" autoComplete="new-password" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} disabled={submitting} className="login__input" /></label>
        )}
        {mode === "login" && (
          <p className="muted small" style={{ margin: "-0.2rem 0 0.4rem", textAlign: "right" }}>
            <button type="button" className="text-button" onClick={() => {
              setResetEmail(email.trim().toLowerCase());
              setResetCode("");
              setNewPassword("");
              setConfirmPassword("");
              setStep("forgot_request");
              setError("");
              setSuccess("");
            }} disabled={submitting}>Forgot password?</button>
          </p>
        )}
        {mode === "register" && <PasswordChecklist checks={passwordChecks} />}
        {success ? <p className="login__success" role="status">{success}</p> : null}
        {error ? <p className="login__error" role="alert">{error}</p> : null}
        <div className="login__actions">
          <button type="button" className="button button--secondary" onClick={onBack} disabled={submitting}>Back</button>
          <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? (mode === "login" ? "Signing in..." : "Creating account...") : (mode === "login" ? "Sign in" : "Create account")}</button>
        </div>
      </form>
      {googleSignInEnabled ? (
        <>
          <div className="login__divider" role="separator">
            <span>or</span>
          </div>
          <GoogleSignInButton disabled={submitting} onClick={handleGoogleSignIn} />
          <p className="muted small login__google-note">Only university .edu Google accounts are allowed.</p>
        </>
      ) : null}
    </LoginShell>
  );
}
