import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchOAuthSession, storeSession } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

interface OAuthError {
  message: string;
  code: string;
}

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<OAuthError | null>(null);
  useDocumentTitle("Signing in");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const errorParam = searchParams.get("error");
      if (errorParam) {
        const msgMap: Record<string, { code: string; message: string }> = {
          oauth_disabled:       { code: "OAUTH_DISABLED",       message: "OAuth sign-in is disabled." },
          oauth_not_configured: { code: "OAUTH_NOT_CONFIGURED", message: "OAuth is not configured on the server." },
          account_not_found:    { code: "ACCOUNT_NOT_FOUND",    message: "Account not found. Please register first." },
          account_exists:       { code: "ACCOUNT_EXISTS",       message: "An account with this email already exists. Please sign in instead." },
          access_denied:        { code: "OAUTH_ERROR",          message: "Sign-in was cancelled." },
        };
        const mapped = msgMap[errorParam] ?? { code: "OAUTH_ERROR", message: "Sign-in failed. Please try again." };
        if (!cancelled) setError(mapped);
        return;
      }

      const exchange = searchParams.get("exchange");
      if (!exchange) {
        if (!cancelled) setError({ code: "OAUTH_ERROR", message: "Invalid response from the provider." });
        return;
      }

      const result = await fetchOAuthSession(exchange);
      if (cancelled) return;

      if (!result.ok) {
        setError({ code: result.code, message: result.message });
        return;
      }

      await storeSession(result.session);
      if (!cancelled) navigate("/app/chats", { replace: true });
    }

    void finish();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  if (error) {
    return (
      <AuthCard title="Sign-in failed">
        <AuthAlert variant="error">{error.message}</AuthAlert>
        <p className="auth-footer">
          {error.code === "ACCOUNT_EXISTS" ? (
            <Link to="/login">Sign in instead</Link>
          ) : error.code === "ACCOUNT_NOT_FOUND" ? (
            <Link to="/register">Create an account</Link>
          ) : (
            <Link to="/login">Back to sign in</Link>
          )}
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Signing you in">
      <p className="auth-oauth-loading" role="status">
        Please wait…
      </p>
    </AuthCard>
  );
}
