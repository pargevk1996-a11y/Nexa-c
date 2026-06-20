import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";
import { releaseGuestAuthShield } from "@/security/privacySeal";
import { isLightTheme, setGlobalTheme } from "@/store/settings";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AuthLegalFooter } from "@/components/auth/AuthLegalFooter";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

const FEATURES = [
  { icon: "🔐", text: "End-to-end encryption" },
  { icon: "⚡", text: "Real-time messaging & presence" },
  { icon: "📹", text: "Encrypted voice & video calls" },
  { icon: "🔥", text: "Ephemeral messages & media" },
  { icon: "🛡️", text: "Screenshot protection" },
];

export function LandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [light, setLight] = useState<boolean>(() => isLightTheme());

  // Default to login — no extra click needed to reach the form.
  const mode: "login" | "register" =
    location.pathname === "/register" ? "register" : "login";

  useDocumentTitle(mode === "register" ? "Create account" : "Sign in");

  useEffect(() => { releaseGuestAuthShield(); }, []);

  // Escape on register → go to login (less jarring than closing everything).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode === "register") navigate("/login");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, navigate]);

  function toggleLight() {
    const next = isLightTheme() ? "dark" : "light";
    setGlobalTheme(next);
    setLight(next === "light");
  }

  return (
    <div className={`home${light ? " home--light" : ""}`} data-theme="dark">
      {/* Scenic background */}
      <div className="auth-starfield" aria-hidden>
        <span className="shooting-star" /><span className="shooting-star" />
        <span className="shooting-star" /><span className="shooting-star" />
        <span className="shooting-star" /><span className="shooting-star" />
        <span className="shooting-star" /><span className="shooting-star" />
      </div>
      <div className="home__nebula" aria-hidden />
      <div className="home__sky" aria-hidden>
        <span className="home__cloud" /><span className="home__cloud" />
        <span className="home__cloud" /><span className="home__cloud" />
      </div>

      {/* Split layout: brand ← | → auth */}
      <div className="home__split">
        {/* ── Brand side ─────────────────────────────────── */}
        <div className="home__brand-side">
          <div className="home__logo-wrap">
            <span className="home__rays" aria-hidden />
            <button
              type="button"
              className="home__logo"
              onClick={toggleLight}
              aria-label={light ? "Switch to night" : "Switch to day"}
              title={light ? "Switch to night" : "Switch to day"}
            >
              <LogoAnimation size={200} />
            </button>
          </div>
          <div className="home__brand-text">
            <h1 className="home__wordmark">{BRAND_NAME}</h1>
            <p className="home__tagline">{BRAND_TAGLINE}</p>
            <ul className="home__features" aria-label="Key features">
              {FEATURES.map((f) => (
                <li key={f.text}>
                  <span className="home__feat-icon" aria-hidden>{f.icon}</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Auth side ──────────────────────────────────── */}
        <div className="home__auth-side">
          {/* Tab switcher */}
          <div className="home__auth-tabs" role="tablist" aria-label="Authentication mode">
            <Link
              to="/login"
              className={`home__auth-tab${mode === "login" ? " home__auth-tab--active" : ""}`}
              role="tab"
              aria-selected={mode === "login"}
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className={`home__auth-tab${mode === "register" ? " home__auth-tab--active" : ""}`}
              role="tab"
              aria-selected={mode === "register"}
            >
              Create account
            </Link>
          </div>

          {/* Form — no card chrome, panel provides the surface */}
          <div className="home__auth-form" role="tabpanel">
            {mode === "login" ? <LoginPage /> : <RegisterPage />}
          </div>
        </div>
      </div>

      <AuthLegalFooter className="home__legal" />
    </div>
  );
}
