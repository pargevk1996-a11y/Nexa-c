import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerAccount } from "@/api/auth";
import { storePendingSignatureForEmail, validateSignatureFormat } from "@/security/signaturePin";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, validateClientPassword } from "@/utils/passwordMessages";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { BRAND_NAME } from "@/config/brand";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signature, setSignature] = useState("");
  // Track the ISO country code (unique) rather than the dial code, because dial
  // codes collide (+1 → US & Canada, +7 → Russia & Kazakhstan) and a duplicate
  // <option value> makes the select impossible to control correctly (BUG-013).
  const [countryCode, setCountryCode] = useState("US");
  const [phone, setPhone] = useState("");
  const dialCode = COUNTRY_CODES.find((c) => c.code === countryCode)?.dial ?? "+1";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Privacy & screenshot-protection consent — required before any registration path.
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentError, setConsentError] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    if (!consentGiven) {
      setConsentError(true);
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    // Validate every field up front and surface all problems at once so the user
    // can fix them in a single pass instead of one-error-at-a-time (BUG-006).
    const errors: Record<string, string> = {};
    if (!trimmedEmail) errors.email = "Email is required";
    if (!trimmedUsername) errors.username = "Username is required";
    if (!password) {
      errors.password = "Password is required";
    } else {
      const passwordErr = validateClientPassword(password);
      if (passwordErr) errors.password = passwordErr;
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

    const fullPhone = phone.trim() ? `${dialCode}${phone.trim().replace(/^0/, "")}` : undefined;

    setLoading(true);
    const result = await registerAccount(trimmedEmail, password, trimmedUsername, fullPhone);
    setLoading(false);

    if (result.ok) {
      storePendingSignatureForEmail(trimmedEmail, signature);
      setSuccess(result.message);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
      return;
    }
    if ("message" in result) {
      setError(result.message);
      if (result.details?.length) {
        setFieldErrors((prev) => ({ ...prev, password: result.details!.join(" ") }));
      }
    }
  }

  return (
    <AuthCard title="Create account">
      <AuthAlert variant="error">{error}</AuthAlert>
      <AuthAlert variant="success">{success}</AuthAlert>

      {/* Consent gate — must be accepted before any registration path */}
      <div className={`consent-block${consentError ? " consent-block--error" : ""}`}>
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

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
          enterKeyHint="next"
          value={signature}
          onChange={(e) => setSignature(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={fieldErrors.signature}
          hint="4–6 digits. Required for sensitive actions (e.g. allowing screenshots)."
          disabled={loading}
        />

        <div className="field">
          <label className="field__label" htmlFor="register-phone">
            Phone number (optional)
          </label>
          <div className="phone-input">
            <select
              className="phone-input__dial"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              disabled={loading}
              aria-label="Country code"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.dial})
                </option>
              ))}
            </select>
            <input
              id="register-phone"
              className="field__input phone-input__number"
              type="tel"
              name="phone"
              autoComplete="tel-national"
              placeholder="(555) 000-0000"
              enterKeyHint="done"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s\-().+]/g, ""))}
              disabled={loading}
            />
          </div>
        </div>

        <Button type="submit" fullWidth loading={loading} disabled={loading || !consentGiven}>
          Create account
        </Button>
      </form>
      <p className="auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
