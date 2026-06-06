import { useState } from "react";
import { approveQrLogin } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function QrLinkDevicePanel() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await approveQrLogin(trimmed);
      setMessage("Device approved. The other screen should sign in shortly.");
      setToken("");
    } catch {
      setError("Invalid or expired QR token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="qr-link-panel">
      <p className="auth-hint">Paste the QR token shown on the device you want to link.</p>
      <Input
        label="QR token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={loading}
      />
      <Button type="button" onClick={() => void handleApprove()} loading={loading}>
        Approve device
      </Button>
      {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
    </div>
  );
}
