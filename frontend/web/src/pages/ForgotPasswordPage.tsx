import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    try {
      const msg = await requestPasswordReset(trimmed);
      setMessage(msg);
    } catch {
      setError("Could not send reset instructions. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset password">
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" fullWidth loading={loading}>
          Send reset link
        </Button>
      </form>
      <p className="auth-footer">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
