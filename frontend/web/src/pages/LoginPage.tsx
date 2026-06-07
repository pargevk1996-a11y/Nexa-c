import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "@/components/auth/AuthCard";
import { BiometricLoginButton } from "@/components/auth/BiometricLoginButton";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { isWebAuthnEnabled } from "@/config/features";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="Sign in">
      {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
      <OAuthButtons alwaysShow onError={(msg) => setError(msg || null)} />
      <p className="auth-divider" role="separator">
        <span>or sign in with email</span>
      </p>
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
      <p className="auth-footer auth-footer--row">
        <Link to="/forgot-password">Forgot password</Link>
        <span aria-hidden> · </span>
        <Link to="/register">Create account</Link>
      </p>
    </AuthCard>
  );
}
