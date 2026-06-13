import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { releaseGuestAuthShield } from "@/security/privacySeal";
import { AuthMobileBrand } from "@/components/auth/AuthMobileBrand";
import { AuthLegalFooter } from "@/components/auth/AuthLegalFooter";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";
import { isLightTheme } from "@/store/settings";

export function AuthLayout() {
  // Respect the device-wide theme instead of hard-coding dark, so navigating
  // from a light home screen into forgot/reset keeps the chosen look (BUG-018).
  const [light, setLight] = useState<boolean>(() => isLightTheme());

  useEffect(() => {
    releaseGuestAuthShield();
  }, []);

  // Keep in sync if the theme is flipped on another surface / by the system.
  useEffect(() => {
    const sync = () => setLight(isLightTheme());
    window.addEventListener("storage", sync);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  return (
    <div
      className={`auth-layout${light ? " auth-layout--light" : ""}`}
      data-theme={light ? "light" : "dark"}
    >
      <div className="auth-starfield" aria-hidden>
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
      </div>
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
        <AuthLegalFooter className="auth-panel__legal" />
      </main>
    </div>
  );
}
