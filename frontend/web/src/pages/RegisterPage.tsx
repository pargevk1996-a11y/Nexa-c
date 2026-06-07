import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerAccount } from "@/api/auth";
import { storePendingSignatureForEmail, validateSignatureFormat } from "@/security/signaturePin";
import { AuthCard } from "@/components/auth/AuthCard";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, validateClientPassword } from "@/utils/passwordMessages";
import { COUNTRY_CODES } from "@/data/countryCodes";

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signature, setSignature] = useState("");
  const [dialCode, setDialCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    if (!trimmedEmail) {
      setFieldErrors((prev) => ({ ...prev, email: "Email is required" }));
      return;
    }
    if (!trimmedUsername) {
      setFieldErrors((prev) => ({ ...prev, username: "Username is required" }));
      return;
    }
    if (!password) {
      setFieldErrors((prev) => ({ ...prev, password: "Password is required" }));
      return;
    }
    const passwordErr = validateClientPassword(password);
    if (passwordErr) {
      setFieldErrors((prev) => ({ ...prev, password: passwordErr }));
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: "Passwords do not match" }));
      return;
    }
    const sigErr = validateSignatureFormat(signature);
    if (sigErr) {
      setFieldErrors((prev) => ({ ...prev, signature: sigErr }));
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
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      {success ? <div className="auth-alert auth-alert--success">{success}</div> : null}

      <OAuthButtons alwaysShow onError={(msg) => setError(msg || null)} />

      <p className="auth-divider" role="separator">
        <span>or sign up with email</span>
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={loading}
        />
        <Input
          label="Username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          disabled={loading}
        />
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="new-password"
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
          value={signature}
          onChange={(e) => setSignature(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={fieldErrors.signature}
          hint="4–6 digits. Required for sensitive actions (e.g. allowing screenshots)."
          disabled={loading}
        />

        <div className="field">
          <label className="field__label">Phone number (optional)</label>
          <div className="phone-input">
            <select
              className="phone-input__dial"
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              disabled={loading}
              aria-label="Country code"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={`${c.code}-${c.dial}`} value={c.dial}>
                  {c.name} ({c.dial})
                </option>
              ))}
            </select>
            <input
              className="field__input phone-input__number"
              type="tel"
              name="phone"
              autoComplete="tel-national"
              placeholder="(555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s\-().+]/g, ""))}
              disabled={loading}
            />
          </div>
        </div>

        <Button type="submit" fullWidth loading={loading}>
          Create account
        </Button>
      </form>
      <p className="auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}
