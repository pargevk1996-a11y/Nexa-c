import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { completeOAuthCallback } from "@/api/auth";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("Signing in");

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
            <AuthAlert variant="error">{error}</AuthAlert>
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
