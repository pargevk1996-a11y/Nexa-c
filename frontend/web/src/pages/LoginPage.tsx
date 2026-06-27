import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PasswordLoginForm } from "@/components/auth/PasswordLoginForm";
import { isDesktopApp } from "@/config/features";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (isDesktopApp()) {
    return <Navigate to="/login/qr" replace />;
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your secure, end-to-end encrypted account.">
      <AuthAlert variant="error">{error}</AuthAlert>
      <OAuthButtons alwaysShow onError={(msg) => setError(msg || null)} />
      <p className="auth-divider" role="separator">
        <span>or sign in with username or email</span>
      </p>
      <PasswordLoginForm
        onSuccess={() => navigate("/app/chats", { replace: true })}
        onError={(msg) => setError(msg || null)}
      />
      <p className="auth-footer auth-footer--row">
        <Link to="/forgot-password">Forgot password</Link>
        <span aria-hidden> · </span>
        <Link to="/register">Create account</Link>
      </p>
    </AuthCard>
  );
}
