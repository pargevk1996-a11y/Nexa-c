import { FormEvent, useState } from "react";
import { changePassword } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, validateClientPassword } from "@/utils/passwordMessages";

export function ChangePasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    const passwordErr = validateClientPassword(next);
    if (passwordErr) {
      setError(passwordErr);
      return;
    }
    setLoading(true);
    try {
      const msg = await changePassword(current, next);
      setMessage(msg);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Could not update password. Check your current password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form change-password-panel" onSubmit={handleSubmit} noValidate>
      <PasswordInput
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        disabled={loading}
      />
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={PASSWORD_HINT}
        disabled={loading}
      />
      <PasswordInput
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        disabled={loading}
      />
      <Button type="submit" loading={loading}>
        Update password
      </Button>
      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
    </form>
  );
}
