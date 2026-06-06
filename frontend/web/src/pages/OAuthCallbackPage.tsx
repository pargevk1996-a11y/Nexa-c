import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { completeOAuthCallback } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const result = await completeOAuthCallback(searchParams);
      if (cancelled) return;

      if (result.ok) {
        navigate("/app/chats", { replace: true });
        return;
      }
      if ("message" in result) setError(result.message);
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <AuthCard title="Signing you in">
        {error ? (
          <>
            <div className="auth-alert auth-alert--error">{error}</div>
            <p className="auth-footer">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <p className="auth-oauth-loading" role="status">
            Please wait…
          </p>
        )}
    </AuthCard>
  );
}
