import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME } from "@/config/brand";

/**
 * Premium cold-start screen — shown while session/crypto bootstrap runs.
 */
export function BootstrapScreen() {
  return (
    <div className="bootstrap-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="bootstrap-screen__backdrop" aria-hidden />
      <div className="bootstrap-screen__glow" aria-hidden />
      <div className="bootstrap-screen__card">
        <LogoAnimation size={180} />
        <h1 className="bootstrap-screen__title">{BRAND_NAME}</h1>
        <p className="bootstrap-screen__tagline">Secure-first messenger</p>
        <div className="bootstrap-screen__progress" aria-hidden>
          <span className="bootstrap-screen__progress-bar" />
        </div>
        <p className="bootstrap-screen__status">Securing your session…</p>
      </div>
    </div>
  );
}
