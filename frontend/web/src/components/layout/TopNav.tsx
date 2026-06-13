import { IconBell, IconLock } from "@/components/icons/Icons";
import { BRAND_NAME } from "@/config/brand";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";
import { useLock } from "@/store/LockContext";

export function TopNav() {
  const { lock } = useLock();

  return (
    <header className="top-nav-zone top-nav-zone--compact">
      <div className="top-nav-bar">
        <div className="top-nav__brand">
          <LogoThemeToggle size={84} className="top-nav__brand-logo" />
          <span className="top-nav__brand-text">{BRAND_NAME}</span>
          {/* Manual screen lock — locks on demand; PIN required to unlock. */}
          <button
            type="button"
            className="top-nav__lock-btn"
            onClick={() => lock("pin_required")}
            aria-label="Lock screen"
            title="Lock screen (PIN required to unlock)"
          >
            <IconLock size={20} />
          </button>
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
