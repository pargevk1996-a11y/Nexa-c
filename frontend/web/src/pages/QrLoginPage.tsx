import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pollQrLogin, startQrLogin, storeSession } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { QrCodeDisplay } from "@/components/auth/QrCodeDisplay";
import { isDesktopApp } from "@/config/features";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function QrLoginPage() {
  const navigate = useNavigate();
  useDocumentTitle("Sign in with QR");
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [pollUrl, setPollUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "approved" | "expired">("loading");
  const [error, setError] = useState<string | null>(null);

  const qrPayload = useMemo(() => {
    if (!qrToken) return "";
    return `nexa://login?token=${qrToken}`;
  }, [qrToken]);

  useEffect(() => {
    let cancelled = false;
    void startQrLogin()
      .then((data) => {
        if (cancelled) return;
        setQrToken(data.qr_token);
        setPollUrl(data.poll_url);
        setStatus("pending");
      })
      .catch(() => {
        if (!cancelled) setError("Could not start QR login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!qrToken || status !== "pending") return;
    const interval = window.setInterval(() => {
      void pollQrLogin(qrToken).then(async (res) => {
        if (res.status === "approved" && res.access_token && res.user) {
          setStatus("approved");
          await storeSession({
            user: res.user,
            accessToken: res.access_token,
            expiresIn: res.expires_in,
            demoMode: false,
          });
          navigate("/app/chats", { replace: true });
        } else if (res.status === "expired") {
          setStatus("expired");
        }
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [qrToken, status, navigate]);

  function refreshQr() {
    setStatus("loading");
    setError(null);
    void startQrLogin()
      .then((data) => {
        setQrToken(data.qr_token);
        setPollUrl(data.poll_url);
        setStatus("pending");
      })
      .catch(() => setError("Could not start QR login"));
  }

  return (
    <AuthCard title="QR sign-in" subtitle="Scan with NEXA on your phone">
      <AuthAlert variant="error">{error}</AuthAlert>
      <div className="qr-login-panel">
        {qrToken && status === "pending" ? (
          <QrCodeDisplay value={qrPayload} size={220} label="Scan to sign in" />
        ) : (
          <div className="qr-login-panel__code" aria-label="QR login status">
            <span>{status === "expired" ? "Expired" : "Loading…"}</span>
          </div>
        )}
        <p className="qr-login-panel__hint">
          {status === "pending"
            ? "On your phone: Settings → Link device → scan this code"
            : status === "expired"
              ? "Code expired."
              : "Preparing QR code…"}
        </p>
        {pollUrl ? (
          <p className="qr-login-panel__token" title={pollUrl}>
            Token: {qrToken?.slice(0, 8)}…
          </p>
        ) : null}
        {status === "expired" ? (
          <button type="button" className="btn btn--secondary" onClick={refreshQr}>
            Refresh QR code
          </button>
        ) : null}
      </div>
      {!isDesktopApp() && (
        <p className="auth-footer">
          <Link to="/login">Sign in with password</Link>
        </p>
      )}
    </AuthCard>
  );
}
