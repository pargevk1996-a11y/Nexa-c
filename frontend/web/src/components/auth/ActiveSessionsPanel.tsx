import { useCallback, useEffect, useState } from "react";
import { listSessions, logout, revokeOtherSessions, revokeSession, type DeviceSession } from "@/api/auth";
import { Button } from "@/components/ui/Button";

export function ActiveSessionsPanel() {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await listSessions());
    } catch {
      setError("Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(id: string, current: boolean) {
    if (current) {
      await logout();
      window.location.href = "/login";
      return;
    }
    await revokeSession(id);
    await load();
  }

  async function handleRevokeOthers() {
    setMessage(null);
    try {
      const res = await revokeOtherSessions();
      setMessage(res.message);
      await load();
    } catch {
      setError("Could not revoke other sessions");
    }
  }

  if (loading) return <p className="auth-hint">Loading devices…</p>;
  if (error) return <p className="auth-alert auth-alert--error">{error}</p>;
  if (sessions.length === 0) return <p className="auth-hint">No active sessions</p>;

  const hasOthers = sessions.some((s) => !s.current);

  return (
    <div className="sessions-panel">
      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
      {hasOthers ? (
        <div className="sessions-panel__actions">
          <Button type="button" variant="secondary" onClick={() => void handleRevokeOthers()}>
            Sign out all other devices
          </Button>
        </div>
      ) : null}
      <ul className="sessions-list">
        {sessions.map((s) => (
          <li key={s.id} className="sessions-list__item">
            <div className="sessions-list__body">
              <strong>{s.device_label}</strong>
              {s.current ? <span className="sessions-list__badge">This device</span> : null}
              <span className="sessions-list__meta">
                Last active {new Date(s.last_used_at).toLocaleString()}
                {s.ip_hint ? ` · ${s.ip_hint}` : ""}
              </span>
            </div>
            <Button
              type="button"
              variant={s.current ? "danger" : "secondary"}
              onClick={() => void handleRevoke(s.id, s.current)}
            >
              {s.current ? "Sign out" : "Revoke"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
