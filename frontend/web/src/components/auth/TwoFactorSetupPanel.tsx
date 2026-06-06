import { FormEvent, useCallback, useEffect, useState } from "react";
import { confirm2fa, disable2fa, fetch2faStatus, setup2fa } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TwoFactorSetupPanel() {
  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch2faStatus();
      setEnabled(res.enabled);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function startSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await setup2fa();
      setSecret(res.secret);
      setUri(res.provisioning_uri);
    } catch {
      setError("Could not start 2FA setup");
    } finally {
      setLoading(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await confirm2fa(code.trim());
      setBackupCodes(res.backup_codes);
      setEnabled(true);
      setSecret(null);
    } catch {
      setError("Invalid code — try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    if (!disableCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const msg = await disable2fa(disableCode.trim());
      setMessage(msg);
      setEnabled(false);
      setDisableCode("");
      setBackupCodes(null);
    } catch {
      setError("Invalid code — 2FA not disabled");
    } finally {
      setLoading(false);
    }
  }

  if (backupCodes) {
    return (
      <div className="twofa-setup">
        <p className="auth-alert auth-alert--success">Two-factor authentication enabled.</p>
        <p className="auth-hint">Save these backup codes:</p>
        <ul className="twofa-setup__codes">
          {backupCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="twofa-setup">
        <p className="auth-alert auth-alert--success">2FA is enabled on your account.</p>
        {message ? <div className="auth-alert auth-alert--info">{message}</div> : null}
        <form className="auth-form" onSubmit={handleDisable}>
          <Input
            label="Code to disable 2FA"
            inputMode="numeric"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            disabled={loading}
            hint="Authenticator or backup code"
          />
          <Button type="submit" variant="danger" loading={loading}>
            Disable 2FA
          </Button>
        </form>
        {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="twofa-setup">
      {!secret ? (
        <Button type="button" onClick={() => void startSetup()} loading={loading}>
          Enable authenticator 2FA
        </Button>
      ) : (
        <form className="auth-form" onSubmit={confirm}>
          <p className="auth-hint">
            Add this secret to Google Authenticator or scan the provisioning URI:
          </p>
          <code className="twofa-setup__secret">{secret}</code>
          {uri ? (
            <a className="twofa-setup__uri" href={uri}>
              Open provisioning link
            </a>
          ) : null}
          <Input
            label="6-digit code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" loading={loading}>
            Confirm 2FA
          </Button>
        </form>
      )}
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
    </div>
  );
}
