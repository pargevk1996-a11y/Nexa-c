import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { releaseGuestAuthShield } from "@/security/privacySeal";
import { AuthMobileBrand } from "@/components/auth/AuthMobileBrand";
import { StarField } from "@/components/auth/StarField";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";

export function AuthLayout() {
  useEffect(() => {
    releaseGuestAuthShield();
  }, []);

  return (
    <div className="auth-layout">
      <StarField />
      <aside className="auth-brand">
        <div className="auth-brand__mesh" />
        <div className="auth-brand__hero">
          <div className="auth-brand__mark">
            <LogoAnimation size={550} />
            <p className="auth-brand__wordmark">{BRAND_NAME}</p>
          </div>
        </div>
        <div className="auth-brand__content">
          <h1>{BRAND_TAGLINE}</h1>
          <p>Fast, minimal, secure messaging with realtime delivery.</p>
        </div>
      </aside>
      <main className="auth-panel">
        <AuthMobileBrand />
        <Outlet />
      </main>
    </div>
  );
}
