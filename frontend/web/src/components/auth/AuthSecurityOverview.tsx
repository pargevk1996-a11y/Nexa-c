import { useCallback, useEffect, useState } from "react";
import { fetchSecurityStatus, type SecurityStatus } from "@/api/auth";
import { isWebAuthnEnabled } from "@/config/features";

export function AuthSecurityOverview() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchSecurityStatus());
      setError(null);
    } catch {
      setError("Could not load security status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="auth-alert auth-alert--error">{error}</p>;
  if (!status) return <p className="auth-hint">Loading…</p>;

  const items = [
    { label: "Email", value: status.email_verified ? "Verified" : "Not verified", ok: status.email_verified },
    {
      label: "Phone",
      value: status.phone_verified
        ? status.phone ?? "Verified"
        : status.phone
          ? "Pending verification"
          : "Not linked",
      ok: status.phone_verified,
    },
    { label: "2FA", value: status.totp_enabled ? "Enabled" : "Off", ok: status.totp_enabled },
    ...(isWebAuthnEnabled()
      ? [
          {
            label: "Passkey",
            value:
              status.webauthn_credentials > 0
                ? `${status.webauthn_credentials} device(s)`
                : "Not registered",
            ok: status.webauthn_credentials > 0,
          },
        ]
      : []),
    { label: "Active sessions", value: String(status.active_sessions), ok: true },
  ];

  return (
    <ul className="auth-security-overview">
      {items.map((item) => (
        <li key={item.label} className={`auth-security-overview__item ${item.ok ? "auth-security-overview__item--ok" : ""}`}>
          <span className="auth-security-overview__label">{item.label}</span>
          <span className="auth-security-overview__value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
