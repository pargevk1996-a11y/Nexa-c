import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAccount, logout, getCachedSession } from "@/api/auth";
import { SettingRow } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function AccountDeletionSection() {
  const navigate = useNavigate();
  const session = getCachedSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (confirm.trim().toUpperCase() !== "DELETE") {
      setError('Type DELETE in the confirmation field');
      return;
    }
    if (session?.demoMode) {
      setError("Account deletion is not available in demo mode");
      return;
    }
    try {
      await deleteAccount(password, confirm);
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError("Deletion failed — check password and confirmation");
    }
  }

  return (
    <section className="settings-group settings-group--danger">
      <h2>Delete account</h2>
      <p className="settings-section__lead">
        Permanently delete your account and sign out on all devices. This cannot be undone.
      </p>
      <div className="settings-card">
        <form onSubmit={(e) => void handleDelete(e)}>
          <SettingRow title="Password" description="Confirm your password.">
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </SettingRow>
          <SettingRow title="Confirmation" description='Type DELETE to confirm.'>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          </SettingRow>
          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          <div className="settings-card__actions">
            <Button type="submit" variant="danger">
              Delete my account
            </Button>
          </div>
        </form>
        <SettingRow title="Sign out only" description="Leave account intact on this device.">
          <Button type="button" variant="secondary" onClick={() => void logout().then(() => navigate("/login"))}>
            Sign out
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
