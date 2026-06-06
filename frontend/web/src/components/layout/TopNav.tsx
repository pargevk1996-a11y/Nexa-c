import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IconBell, IconMoon, IconSearch, IconSun } from "@/components/icons/Icons";
import { StoryStrip } from "@/components/stories/StoryStrip";
import { BRAND_NAME } from "@/config/brand";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { useChatOptional } from "@/store/ChatContext";
import { useSettings } from "@/store/SettingsContext";

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const onChatsPage = location.pathname.startsWith("/app/chats");
  const { settings, update } = useSettings();
  const [globalSearch, setGlobalSearch] = useState("");

  const chat = useChatOptional();
  const setChatSearch = chat?.setSearch ?? null;
  const chatSearch = chat?.search ?? "";

  useEffect(() => {
    setGlobalSearch(chatSearch);
  }, [chatSearch]);

  function runSearch() {
    const q = globalSearch.trim();
    setChatSearch?.(q);
    if (q) {
      navigate(`/app/chats?q=${encodeURIComponent(q)}`);
    }
  }

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

        {!onChatsPage ? (
          <div className="top-nav__stories-slot">
            <StoryStrip />
          </div>
        ) : null}

        <div className="top-nav-bar__actions">
          <label className="top-nav__search">
            <IconSearch size={16} className="top-nav__search-icon" />
            <input
              type="search"
              placeholder="$username or search…"
              value={globalSearch}
              onChange={(e) => {
                const v = e.target.value;
                setGlobalSearch(v);
                setChatSearch?.(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              aria-label="Global search"
            />
          </label>
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
