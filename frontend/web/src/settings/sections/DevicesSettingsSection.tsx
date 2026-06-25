import { useCallback, useEffect, useRef, useState } from "react";
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
import { exportDeviceKeys, importDeviceKeys } from "@/security/keyExport";

/** Web: sessions only. Native / flag-enabled builds may show WebAuthn registration. */
export function DevicesSettingsSection() {
  return (
    <>
      {isWebAuthnEnabled() ? <DevicesWebAuthnSection /> : (
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
      )}
      <KeyBackupSection />
    </>
  );
}

function KeyBackupSection() {
  const [exportPass, setExportPass] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [importJson, setImportJson] = useState<string | null>(null);
  const [importPass, setImportPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<"info" | "error">("info");
  const fileRef = useRef<HTMLInputElement>(null);

  function _setMsg(text: string, type: "info" | "error" = "info") {
    setMsg(text);
    setMsgType(type);
  }

  async function handleExport() {
    if (!exportPass || exportPass !== exportConfirm) {
      _setMsg("Passphrases do not match.", "error");
      return;
    }
    try {
      const json = await exportDeviceKeys(exportPass);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexa-keys.json";
      a.click();
      URL.revokeObjectURL(url);
      setExportPass("");
      setExportConfirm("");
      _setMsg("Key backup downloaded. Store it somewhere safe.");
    } catch (e) {
      _setMsg(e instanceof Error ? e.message : "Export failed", "error");
    }
  }

  async function handleImport() {
    if (!importJson || !importPass) {
      _setMsg("Select a backup file and enter your passphrase.", "error");
      return;
    }
    try {
      await importDeviceKeys(importJson, importPass);
      setImportPass("");
      setImportJson(null);
      _setMsg("Keys imported. Reload the app to apply changes.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      _setMsg(msg === "WRONG_PASSPHRASE" ? "Wrong passphrase." : msg, "error");
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(typeof ev.target?.result === "string" ? ev.target.result : null);
    reader.readAsText(file);
  }

  return (
    <section className="settings-group">
      <h2>E2EE Key Backup</h2>
      <p className="settings-section__lead">
        Export your encryption keys to use {" "}NEXA on another device. The backup is encrypted with a passphrase
        you choose — only you can open it.
      </p>
      {msg ? (
        <div className={`auth-alert auth-alert--${msgType === "error" ? "error" : "info"}`}>{msg}</div>
      ) : null}
      <div className="settings-card">
        <SettingRow title="Export keys" description="Download an encrypted backup of your ECDH key pair.">
          <div className="settings-key-backup__fields">
            <input
              className="auth-input"
              type="password"
              placeholder="Passphrase"
              value={exportPass}
              onChange={e => setExportPass(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Confirm passphrase"
              value={exportConfirm}
              onChange={e => setExportConfirm(e.target.value)}
              autoComplete="new-password"
            />
            <Button type="button" variant="secondary" onClick={() => void handleExport()}>
              Download backup
            </Button>
          </div>
        </SettingRow>
        <SettingRow
          title="Import keys"
          description="Restore keys from a .json backup. This overwrites your current device keys."
        >
          <div className="settings-key-backup__fields">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFile}
              style={{ display: "none" }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              {importJson ? "File selected" : "Choose backup file"}
            </Button>
            <input
              className="auth-input"
              type="password"
              placeholder="Passphrase"
              value={importPass}
              onChange={e => setImportPass(e.target.value)}
              autoComplete="current-password"
            />
            <Button type="button" variant="primary" onClick={() => void handleImport()} disabled={!importJson}>
              Import keys
            </Button>
          </div>
        </SettingRow>
      </div>
    </section>
  );
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
