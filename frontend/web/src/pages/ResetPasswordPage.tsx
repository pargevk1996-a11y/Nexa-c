import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, validateClientPassword } from "@/utils/passwordMessages";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ApiError } from "@/api/client";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("New password");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Invalid reset link. Request a new one.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    const passwordErr = validateClientPassword(password);
    if (passwordErr) {
      setError(passwordErr);
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true, state: { message: "Password updated. Sign in with your new password." } });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not reset password");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="New password" subtitle="At least 8 characters; letters and numbers only">
        <AuthAlert variant="error">{error}</AuthAlert>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <PasswordInput
            label="New password"
            name="new_password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={PASSWORD_HINT}
            disabled={loading}
          />
          <PasswordInput
            label="Confirm password"
            name="confirm_password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" fullWidth loading={loading} disabled={!token}>
            Update password
          </Button>
        </form>
      <p className="auth-footer">
        <Link to="/forgot-password">Request new link</Link>
      </p>
    </AuthCard>
  );
}
