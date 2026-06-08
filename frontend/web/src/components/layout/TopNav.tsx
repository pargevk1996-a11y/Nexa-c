import { Link } from "react-router-dom";
import { IconBell, IconMoon, IconSun } from "@/components/icons/Icons";
import { BRAND_NAME } from "@/config/brand";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { useSettings } from "@/store/SettingsContext";

export function TopNav() {
  const { settings, update } = useSettings();

  const isDark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  function toggleTheme() {
    update("theme", isDark ? "light" : "dark");
  }

  return (
    <header className="top-nav-zone top-nav-zone--compact">
      <div className="top-nav-bar">
        <Link to="/app/chats" className="top-nav__brand">
          <LogoAnimation size={84} />
          <span className="top-nav__brand-text">{BRAND_NAME}</span>
        </Link>

        <div className="top-nav-bar__actions">
          <button type="button" className="top-nav__icon-btn" aria-label="Notifications">
            <IconBell size={18} />
          </button>
          <button
            type="button"
            className="top-nav__icon-btn"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
