import { useCallback, useEffect, useState } from "react";
import {
  fetchSecurityStatus,
  getCachedSession,
  listWebAuthnDevices,
  removeWebAuthnCredentials,
  type WebAuthnDevice,
} from "@/api/auth";
import { ActiveSessionsPanel } from "@/components/auth/ActiveSessionsPanel";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";
import { Button } from "@/components/ui/Button";
import { isWebAuthnEnabled } from "@/config/features";
import { isWebAuthnAvailable, registerPlatformAuthenticator } from "@/security/webauthn";
import { useSettings } from "@/store/SettingsContext";

/** Web: sessions only. Native / flag-enabled builds may show WebAuthn registration. */
export function DevicesSettingsSection() {
  if (!isWebAuthnEnabled()) {
    return (
      <section className="settings-group">
        <h2>Trusted Access Points</h2>
        <p className="settings-section__lead">
          Manage the devices allowed to access your account. Biometric unlock (Touch ID, Face ID, fingerprint) is
          available in the desktop and mobile apps, not in the web client.
        </p>
        <div className="settings-card settings-card--flush">
          <ActiveSessionsPanel />
        </div>
      </section>
    );
  }

  return <DevicesWebAuthnSection />;
}

function DevicesWebAuthnSection() {
  const session = getCachedSession();
  const { settings, update } = useSettings();
  const [devices, setDevices] = useState<WebAuthnDevice[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [devs, sec] = await Promise.all([listWebAuthnDevices(), fetchSecurityStatus()]);
      setDevices(devs);
      setStatus(`${sec.active_sessions} active session(s) · ${sec.webauthn_credentials} passkey(s)`);
    } catch {
      setStatus("Could not load devices");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function registerPasskey() {
    if (!session) return;
    const ok = await registerPlatformAuthenticator(session.user.id, session.user.username);
    setMessage(ok ? "Device registered" : "Registration failed");
    await load();
  }

  async function removeAllPasskeys() {
    try {
      const msg = await removeWebAuthnCredentials();
      setMessage(msg);
      update("biometricEnabled", false);
      await load();
    } catch {
      setMessage("Could not remove credentials");
    }
  }

  return (
    <section className="settings-group">
      <h2>Trusted Access Points</h2>
      <p className="settings-section__lead">Passkeys and active sign-in sessions.</p>
      {status ? <p className="auth-hint">{status}</p> : null}
      <div className="settings-card">
        <SettingRow
          title="Passkey"
          description={
            isWebAuthnAvailable() ? "Register a passkey on this device." : "Not supported in this browser."
          }
        >
          <Toggle
            label="Passkey"
            checked={settings.biometricEnabled}
            onChange={(v) => {
              if (v) void registerPasskey();
              else void removeAllPasskeys();
            }}
          />
        </SettingRow>
        {devices.length > 0 ? (
          <ul className="settings-device-list">
            {devices.map((d) => (
              <li key={d.id}>
                <strong>{d.device_label}</strong>
                <span className="settings-device-list__meta">{d.credential_id}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="auth-hint">No passkeys registered.</p>
        )}
        {message ? <div className="auth-alert auth-alert--info">{message}</div> : null}
        <div className="settings-card__actions">
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          {devices.length > 0 ? (
            <Button type="button" variant="danger" onClick={() => void removeAllPasskeys()}>
              Remove all passkeys
            </Button>
          ) : null}
        </div>
      </div>
      <div className="settings-card settings-card--flush">
        <ActiveSessionsPanel />
      </div>
    </section>
  );
}
