import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchAuthConfig } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { BiometricLoginButton } from "@/components/auth/BiometricLoginButton";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { isOAuthEnabled, isWebAuthnEnabled } from "@/config/features";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [oauthOn, setOauthOn] = useState(isOAuthEnabled());

  useEffect(() => {
    void fetchAuthConfig()
      .then((c) => setOauthOn(c.oauth_enabled || isOAuthEnabled()))
      .catch(() => undefined);
  }, []);

  return (
    <AuthCard title="Sign in">
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      <PasswordLoginForm
        onSuccess={() => navigate("/app/chats", { replace: true })}
        onError={(msg) => setError(msg || null)}
      />
      {isWebAuthnEnabled() ? (
        <>
          <p className="auth-divider" role="separator">
            <span>or</span>
          </p>
          <BiometricLoginButton
            onSuccess={() => navigate("/app/chats", { replace: true })}
            onError={(msg) => setError(msg)}
          />
        </>
      ) : null}
      {oauthOn ? <OAuthButtons onError={(msg) => setError(msg || null)} /> : null}
      <p className="auth-footer auth-footer--row">
        <Link to="/forgot-password">Forgot password</Link>
        <span aria-hidden> · </span>
        <Link to="/register">Create account</Link>
      </p>
    </AuthCard>
  );
}
