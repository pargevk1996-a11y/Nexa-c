import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";
import { releaseGuestAuthShield } from "@/security/privacySeal";
import { getGlobalTheme, isLightTheme, setGlobalTheme } from "@/store/settings";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthLegalFooter } from "@/components/auth/AuthLegalFooter";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

export function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Reflects the device-wide theme; toggled by clicking the logo and shared
  // with the whole app (so logging in keeps the same light / dark mode).
  const [light, setLight] = useState<boolean>(() => isLightTheme());

  const mode =
    location.pathname === "/login"
      ? "login"
      : location.pathname === "/register"
        ? "register"
        : null;

  // Unique, descriptive document titles per surface (BUG-025).
  useDocumentTitle(
    mode === "login"
      ? "Sign in"
      : mode === "register"
        ? "Create account"
        : "Secure messenger",
  );

  // Guests on the home screen must not be hidden by the privacy shield.
  useEffect(() => {
    releaseGuestAuthShield();
  }, []);

  // Close the auth modal with Escape; lock body scroll while it is open.
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mode, navigate]);

  function toggleLight() {
    const next = isLightTheme(getGlobalTheme()) ? "dark" : "light";
    setGlobalTheme(next);
    setLight(next === "light");
  }

  const close = () => navigate("/");

  return (
    // Force dark design tokens for the home surfaces (incl. the auth modal) so
    // they stay readable, while `.home--light` drives the day sky / sun look.
    <div className={`home${light ? " home--light" : ""}`} data-theme="dark">
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
      <div className="home__nebula" aria-hidden />

      {/* Daytime sky + drifting clouds (shown in light mode) */}
      <div className="home__sky" aria-hidden>
        <span className="home__cloud" />
        <span className="home__cloud" />
        <span className="home__cloud" />
        <span className="home__cloud" />
      </div>

      <main className="home__hero">
        <div className="home__logo-wrap">
          <span className="home__rays" aria-hidden />
          <button
            type="button"
            className="home__logo"
            onClick={toggleLight}
            aria-label={light ? "Switch to night" : "Switch to day"}
            title={light ? "Click the logo — switch to night" : "Click the logo — switch to day"}
          >
            <LogoAnimation size={480} />
          </button>
        </div>

        <div className="home__text">
          <h1 className="home__wordmark">{BRAND_NAME}</h1>
          <p className="home__tagline">{BRAND_TAGLINE}</p>
          <p className="home__sub">
            A next-generation messenger built with security, speed, and
            simplicity in mind — end-to-end encrypted by default, encrypted in
            transit and at rest, realtime by design.
          </p>
          <div className="home__cta">
            <Link to="/login" className="home__btn home__btn--ghost">
              Log in
            </Link>
            <Link to="/register" className="home__btn home__btn--primary">
              Create account
            </Link>
          </div>
        </div>
      </main>

      <AuthLegalFooter className="home__legal" />

      {mode ? (
        <div
          className="home-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-card-title"
        >
          {/* Backdrop is presentational: clicking it closes the dialog, but it is
              hidden from the accessibility tree so there is exactly one "Close"
              control (BUG-007) and it cannot steal focus on click (BUG-024). */}
          <div
            className="home-modal__backdrop"
            aria-hidden="true"
            onMouseDown={(e) => e.preventDefault()}
            onClick={close}
          />
          <div className="home-modal__panel">
            <button
              type="button"
              className="home-modal__close"
              aria-label="Close dialog"
              onClick={close}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <aside className="home-modal__aside" aria-hidden="true">
              <p className="home-modal__aside-brand">Nexa</p>
              <ul className="home-modal__aside-features">
                <li><span>🔐</span><span>End-to-end encryption</span></li>
                <li><span>⚡</span><span>Real-time messaging &amp; presence</span></li>
                <li><span>📹</span><span>Encrypted video &amp; voice calls</span></li>
                <li><span>🔥</span><span>Ephemeral messages &amp; media</span></li>
                <li><span>🛡️</span><span>Screenshot protection &amp; privacy seal</span></li>
              </ul>
              <p className="home-modal__aside-tagline">Your privacy, by design.</p>
            </aside>
            {mode === "login" ? <LoginPage /> : <RegisterPage />}
          </div>
        </div>
      ) : null}
    </div>
  );
}
