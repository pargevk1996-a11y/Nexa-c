import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { resendVerificationEmail, verifyEmail } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("Verify email");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim() || code.trim().length < 6) {
      setError("Enter your email and 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const msg = await verifyEmail(email.trim(), code.trim());
      setMessage(msg);
    } catch {
      setError("Invalid or expired code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email.trim()) {
      setError("Enter your email first");
      return;
    }
    setResending(true);
    setError(null);
    try {
      const msg = await resendVerificationEmail(email.trim());
      setMessage(msg);
    } catch {
      setError("Could not resend code");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard title="Verify email">
        <AuthAlert variant="error">{error}</AuthAlert>
        <AuthAlert variant="success">{message}</AuthAlert>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            label="Verification code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" fullWidth loading={loading}>
            Verify
          </Button>
          <Button type="button" variant="secondary" fullWidth loading={resending} onClick={() => void handleResend()}>
            Resend code
          </Button>
        </form>
        <p className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </p>
    </AuthCard>
  );
}
