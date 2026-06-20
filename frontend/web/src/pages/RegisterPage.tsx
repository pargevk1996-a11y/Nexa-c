import { FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerAccount, resendVerificationEmail, verifyEmail } from "@/api/auth";
import { storePendingSignatureForEmail, validateSignatureFormat } from "@/security/signaturePin";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, validateClientPassword } from "@/utils/passwordMessages";
import { BRAND_NAME } from "@/config/brand";

type Step = "form" | "confirm-email" | "verify-code";

export function RegisterPage() {
  const navigate = useNavigate();

  // Form fields
  const [email, setEmail]                   = useState("");
  const [username, setUsername]             = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signature, setSignature]           = useState("");

  // Multi-step state
  const [step, setStep]     = useState<Step>("form");
  const [code, setCode]     = useState("");
  const codeInputRef        = useRef<HTMLInputElement>(null);

  // Status
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Consent
  const [consentGiven, setConsentGiven]   = useState(false);
  const [consentError, setConsentError]   = useState(false);

  // ── Step 1: validate form → go to confirm screen ─────────────────────────
  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!consentGiven) {
      setConsentError(true);
      return;
    }

    const trimmedEmail    = email.trim();
    const trimmedUsername = username.trim();
    const errors: Record<string, string> = {};

    if (!trimmedEmail)    errors.email    = "Email is required";
    if (!trimmedUsername) errors.username = "Username is required";
    if (!password) {
      errors.password = "Password is required";
    } else {
      const pwErr = validateClientPassword(password);
      if (pwErr) errors.password = pwErr;
    }
    if (password && password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    const sigErr = validateSignatureFormat(signature);
    if (sigErr) errors.signature = sigErr;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setStep("confirm-email");
  }

  // ── Step 2: user confirmed email → call register → move to code entry ────
  async function handleSendCode() {
    setError(null);
    setLoading(true);
    const result = await registerAccount(email.trim(), password, username.trim());
    setLoading(false);

    if (result.ok) {
      storePendingSignatureForEmail(email.trim(), signature);
      setCode("");
      setStep("verify-code");
      setTimeout(() => codeInputRef.current?.focus(), 80);
      return;
    }

    if ("message" in result) {
      setError(result.message);
      if (result.details?.length) {
        setFieldErrors((prev) => ({ ...prev, password: result.details!.join(" ") }));
      }
      // Go back to form on any server-side validation error
      setStep("form");
    }
  }

  // ── Step 3: verify the 6-digit code ──────────────────────────────────────
  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    try {
      await verifyEmail(email.trim(), code.trim());
      navigate("/login", { replace: true, state: { verified: true } });
    } catch {
      setError("Invalid or expired code. Try again or request a new one.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setResending(true);
    try {
      await resendVerificationEmail(email.trim());
    } catch {
      setError("Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Registration form
  // ─────────────────────────────────────────────────────────────────────────
  if (step === "form") {
    return (
      <AuthCard title="Create account">
        <AuthAlert variant="error">{error}</AuthAlert>

        <div className={`consent-block${consentError ? " consent-block--error" : ""}${consentGiven ? " consent-block--accepted" : ""}`}>
          <label className="consent-block__label">
            <input
              type="checkbox"
              className="consent-block__checkbox"
              checked={consentGiven}
              onChange={(e) => {
                setConsentGiven(e.target.checked);
                if (e.target.checked) setConsentError(false);
              }}
            />
            <span className="consent-block__text">
              I have read and agree to {BRAND_NAME}'s{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
              {" "}and{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>.
              {" "}I consent to {BRAND_NAME} activating screenshot and screen-recording protection on my device,
              including intercepting screenshot keyboard shortcuts in the browser and enabling
              OS-level screen-capture restrictions in native apps, to protect private communications.
            </span>
            {consentGiven && (
              <span className="consent-block__accepted-hint">Agreed</span>
            )}
          </label>
          {consentError && (
            <p className="consent-block__error" role="alert">
              You must accept the Privacy Policy and screenshot-protection consent to create an account.
            </p>
          )}
        </div>

        <OAuthButtons
          alwaysShow
          consentGiven={consentGiven}
          onConsentMissing={() => setConsentError(true)}
          onError={(msg) => setError(msg || null)}
        />

        <p className="auth-divider" role="separator">
          <span>or sign up with email or username</span>
        </p>

        <form className="auth-form" onSubmit={handleFormSubmit} noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            enterKeyHint="next"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            disabled={loading}
          />
          <Input
            label="Username"
            name="username"
            autoComplete="username"
            enterKeyHint="next"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={fieldErrors.username}
            disabled={loading}
          />
          <PasswordInput
            label="Password"
            name="password"
            autoComplete="new-password"
            enterKeyHint="next"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint={PASSWORD_HINT}
            disabled={loading}
          />
          <PasswordInput
            label="Confirm password"
            name="confirm_password"
            autoComplete="new-password"
            enterKeyHint="next"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
            disabled={loading}
          />
          <PasswordInput
            label="Signature"
            name="signature"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            value={signature}
            onChange={(e) => setSignature(e.target.value.replace(/\D/g, "").slice(0, 6))}
            error={fieldErrors.signature}
            hint="4–6 digits. Required for sensitive actions (e.g. allowing screenshots)."
            disabled={loading}
          />

          <Button type="submit" fullWidth disabled={!consentGiven}>
            Create account
          </Button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </AuthCard>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Confirm email
  // ─────────────────────────────────────────────────────────────────────────
  if (step === "confirm-email") {
    return (
      <AuthCard title="Confirm your email">
        <AuthAlert variant="error">{error}</AuthAlert>

        <div className="register-confirm-email">
          <p className="register-confirm-email__label">We will send a verification code to:</p>
          <p className="register-confirm-email__address">{email.trim()}</p>
          <p className="register-confirm-email__hint">Make sure the address is correct before continuing.</p>
        </div>

        <div className="auth-form">
          <Button fullWidth loading={loading} onClick={() => void handleSendCode()}>
            Send verification code
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={loading}
            onClick={() => { setError(null); setStep("form"); }}
          >
            Change email
          </Button>
        </div>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </AuthCard>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Enter verification code
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AuthCard title="Enter code">
      <AuthAlert variant="error">{error}</AuthAlert>

      <p className="register-confirm-email__label" style={{ marginBottom: "1.25rem" }}>
        A 6-digit code was sent to <strong>{email.trim()}</strong>
      </p>

      <form className="auth-form" onSubmit={(e) => void handleVerifyCode(e)} noValidate>
        <Input
          ref={codeInputRef}
          label="Enter code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={loading}
        />
        <Button type="submit" fullWidth loading={loading} disabled={loading || code.trim().length < 6}>
          Verify
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          loading={resending}
          disabled={loading || resending}
          onClick={() => void handleResendCode()}
        >
          Resend code
        </Button>
      </form>

      <p className="auth-footer">
        <button
          type="button"
          className="auth-footer__link"
          onClick={() => { setError(null); setCode(""); setStep("form"); }}
        >
          ← Back to registration
        </button>
      </p>
    </AuthCard>
  );
}
