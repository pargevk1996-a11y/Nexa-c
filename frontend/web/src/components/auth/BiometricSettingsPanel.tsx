import { useEffect, useState } from "react";
import { getCachedSession } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { biometricLabel } from "@/config/features";
import {
  biometricServerEnabled,
  disableBiometric,
  enableBiometric,
  isBiometricAvailable,
  isBiometricEnabledLocally,
} from "@/security/biometric";

/** Mobile-only panel to enable / disable biometric (Face ID / fingerprint)
 *  PIN unlock. The parent only renders it when the device supports it. */
export function BiometricSettingsPanel() {
  const label = biometricLabel();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean>(isBiometricEnabledLocally());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const ok = await isBiometricAvailable();
      if (!active) return;
      setAvailable(ok);
      // Reconcile the local hint with the server's source of truth.
      try {
        const server = await biometricServerEnabled();
        if (active) setEnabled(server);
      } catch {
        /* keep local value */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleEnable() {
    setError(null);
    setBusy(true);
    try {
      const s = getCachedSession();
      const uid = s?.user?.id;
      const uname = s?.user?.username || s?.user?.email || "Nexa user";
      if (!uid) {
        setError("Please sign in again to enable biometrics.");
        return;
      }
      const ok = await enableBiometric(uid, uname);
      if (ok) setEnabled(true);
      else setError(`Could not enable ${label}. Your device may have declined.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError(null);
    setBusy(true);
    try {
      await disableBiometric();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  if (available === false) {
    return <p className="settings-hint">This device does not offer {label}.</p>;
  }

  return (
    <div className="biometric-panel">
      <p className="settings-hint">
        {enabled
          ? `${label} unlock is on. Open the app with ${label} instead of your PIN.`
          : `Unlock the app with ${label} instead of typing your PIN.`}
      </p>
      {enabled ? (
        <Button variant="secondary" type="button" onClick={() => void handleDisable()} disabled={busy}>
          {busy ? "Working…" : `Turn off ${label}`}
        </Button>
      ) : (
        <Button variant="primary" type="button" onClick={() => void handleEnable()} disabled={busy}>
          {busy ? "Setting up…" : `Enable ${label}`}
        </Button>
      )}
      {error && <p className="settings-error">{error}</p>}
    </div>
  );
}
