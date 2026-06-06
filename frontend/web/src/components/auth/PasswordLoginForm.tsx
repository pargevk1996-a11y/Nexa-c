import { FormEvent, useState } from "react";
import { completeLogin2fa, loginWithPassword } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

interface PasswordLoginFormProps {
  onSuccess: () => void;
  onError: (message: string | null) => void;
}

export function PasswordLoginForm({ onSuccess, onError }: PasswordLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; totp?: string }>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setFieldErrors({});

    if (challengeId) {
      const code = totpCode.replace(/\s/g, "");
      if (code.length < 6) {
        setFieldErrors({ totp: "Enter your 6-digit code or backup code" });
        return;
      }
      setLoading(true);
      const result = await completeLogin2fa(challengeId, code);
      setLoading(false);
      if (result.ok) {
        onSuccess();
        return;
      }
      if ("message" in result) {
        onError(result.message);
      }
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldErrors({ email: "Email is required" });
      return;
    }
    if (!password) {
      setFieldErrors({ password: "Password is required" });
      return;
    }

    setLoading(true);
    const result = await loginWithPassword(trimmedEmail, password);
    setLoading(false);

    if (result.ok) {
      onSuccess();
      return;
    }
    if ("requires2fa" in result && result.requires2fa) {
      setChallengeId(result.challengeId);
      return;
    }
    if ("emailNotVerified" in result && result.emailNotVerified) {
      onError(`Please verify ${trimmedEmail} before signing in. Check your inbox for a confirmation message.`);
      return;
    }
    if ("passwordResetRequired" in result && result.passwordResetRequired) {
      onError(result.message);
      return;
    }
    if ("message" in result) {
      onError(result.message);
    }
  }

  if (challengeId) {
    return (
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <p className="auth-hint">Two-factor authentication is enabled. Enter the code from your authenticator app.</p>
        <Input
          label="Authentication code"
          name="totp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          error={fieldErrors.totp}
          disabled={loading}
        />
        <Button type="submit" fullWidth loading={loading}>
          Verify
        </Button>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={loading}
          onClick={() => {
            setChallengeId(null);
            setTotpCode("");
            onError(null);
          }}
        >
          Back
        </Button>
      </form>
    );
  }

  return (
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
      <PasswordInput
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        disabled={loading}
      />
      <Button type="submit" fullWidth loading={loading}>
        Sign in
      </Button>
    </form>
  );
}
