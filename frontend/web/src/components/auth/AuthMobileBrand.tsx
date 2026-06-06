import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { BRAND_NAME } from "@/config/brand";

/** Shown once on narrow screens where the auth sidebar is hidden. */
export function AuthMobileBrand() {
  return (
    <div className="auth-card__mobile-logo" aria-hidden={false}>
      <LogoAnimation size={120} />
      <p className="auth-brand__wordmark">{BRAND_NAME}</p>
    </div>
  );
}
