import { IconBell } from "@/components/icons/Icons";
import { BRAND_NAME } from "@/config/brand";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";

export function TopNav() {
  return (
    <header className="top-nav-zone top-nav-zone--compact">
      <div className="top-nav-bar">
        <div className="top-nav__brand">
          <LogoThemeToggle size={84} className="top-nav__brand-logo" />
          <span className="top-nav__brand-text">{BRAND_NAME}</span>
        </div>

        <div className="top-nav-bar__actions">
          <button type="button" className="top-nav__icon-btn" aria-label="Notifications">
            <IconBell size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
