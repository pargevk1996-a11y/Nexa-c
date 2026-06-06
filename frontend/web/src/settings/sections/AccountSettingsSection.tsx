import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { getCachedSession, logout } from "@/api/auth";
import { SettingRow } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useProfile } from "@/store/ProfileContext";

export function AccountSettingsSection() {
  const session = getCachedSession();
  const { profile, loading, save } = useProfile();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await logout();
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setNickname(profile.nickname);
  }, [profile]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({
        username: username.trim().replace(/^\$/, ""),
        nickname: nickname.trim(),
      });
      setMessage("Username updated");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "USERNAME_TAKEN" ? "Username taken" : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) return <p className="auth-hint">Loading profile…</p>;

  return (
    <section className="settings-group">
      <h2>Account</h2>
      <p className="settings-section__lead">Customize your public username and display name.</p>
      <div className="settings-card">
        {session ? (
          <SettingRow title="Public ID" description="Your unique handle (read-only).">
            <code className="settings-code">${session.user.uid}</code>
          </SettingRow>
        ) : null}
        <form onSubmit={(e) => void handleSubmit(e)}>
          <SettingRow title="Username" description="3–32 characters, letters, numbers, underscore.">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
            />
          </SettingRow>
          <SettingRow title="Display name" description="Shown in chats and notifications.">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Display name"
            />
          </SettingRow>
          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
          <div className="settings-card__actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save username"}
            </Button>
          </div>
        </form>
        <SettingRow title="Sign out" description="Sign out of your account on this device.">
          <Button
            type="button"
            variant="danger"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </SettingRow>
      </div>
    </section>
  );
}
