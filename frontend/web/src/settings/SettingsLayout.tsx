import { useMemo, useState, type ReactNode } from "react";
import { useProfile } from "@/store/ProfileContext";
import { Avatar } from "@/components/ui/Avatar";
import { IconSearch, IconX, IconChevronLeft } from "@/components/icons/Icons";
import { displayName } from "@/utils/presenceText";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./types";
import { SectionIcon } from "./SectionIcon";

interface SettingsLayoutProps {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  children: ReactNode;
}

export function SettingsLayout({ active, onSelect, children }: SettingsLayoutProps) {
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

  const groups = useMemo(() => [...new Set(SETTINGS_SECTIONS.map((s) => s.group))], []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q),
    );
  }, [query]);

  const activeLabel = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "Settings";

  function select(id: SettingsSectionId) {
    onSelect(id);
    setDetailOpen(true);
    setQuery("");
  }

  const userName = profile
    ? displayName({ username: profile.username, nickname: profile.nickname })
    : "";
  const userHandle = profile?.username ?? "";
  const avatarUrl = profile?.avatar_url ?? null;
  const animUrl = profile?.animated_avatar_url ?? null;
  const avatarKind = profile?.avatar_kind ?? "image";
  const isOnline = profile?.is_online ?? false;

  return (
    <div className={`settings-layout${detailOpen ? " settings-layout--detail-open" : ""}`}>

      {/* ── LEFT: NAV + HOME CARDS ──────────────────────────────────── */}
      <nav className="settings-nav" aria-label="Settings sections">

        {/* User mini-header */}
        <div className="settings-nav__user">
          {profile ? (
            <Avatar
              name={userName}
              size="sm"
              online={isOnline}
              avatarUrl={avatarUrl}
              animatedUrl={animUrl}
              avatarKind={avatarKind}
            />
          ) : (
            <div className="settings-nav__user-avatar-placeholder" />
          )}
          <div className="settings-nav__user-text">
            <span className="settings-nav__user-name">{userName || "—"}</span>
            {userHandle ? (
              <span className="settings-nav__user-handle">
                @{userHandle.replace(/^\$/, "")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Search */}
        <label className="settings-nav__search">
          <IconSearch size={15} className="settings-nav__search-icon" />
          <input
            type="search"
            placeholder="Search settings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search settings"
          />
          {query ? (
            <button
              type="button"
              className="settings-nav__search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <IconX size={13} />
            </button>
          ) : null}
        </label>

        {/* ── MOBILE home: full-width card list ───────────────────── */}
        <div className="settings-home-cards">
          {filtered.length === 0 ? (
            <p className="settings-home-cards__empty">No results for "{query}"</p>
          ) : null}
          {groups.map((group) => {
            const items = filtered.filter((s) => s.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="settings-home-cards__group">
                <span className="settings-home-cards__group-label">{group}</span>
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`settings-home-card${active === s.id ? " settings-home-card--active" : ""}`}
                    onClick={() => select(s.id)}
                  >
                    <span
                      className="settings-home-card__icon"
                      style={{ background: s.color }}
                      aria-hidden
                    >
                      <SectionIcon id={s.id} size={20} />
                    </span>
                    <span className="settings-home-card__body">
                      <span className="settings-home-card__label">{s.label}</span>
                      <span className="settings-home-card__desc">{s.description}</span>
                    </span>
                    <span className="settings-home-card__chevron" aria-hidden>›</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── DESKTOP sidebar: compact grouped list ───────────────── */}
        <div className="settings-nav__list-wrap">
          {groups.map((group) => {
            const items = filtered.filter((s) => s.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="settings-nav__group">
                <span className="settings-nav__group-label">{group}</span>
                <ul className="settings-nav__list">
                  {items.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`settings-nav__item${active === s.id ? " settings-nav__item--active" : ""}`}
                        onClick={() => select(s.id)}
                        aria-current={active === s.id ? "page" : undefined}
                      >
                        <span
                          className="settings-nav__item-dot"
                          style={{ background: s.color }}
                          aria-hidden
                        />
                        <span className="settings-nav__item-text">
                          <span className="settings-nav__item-label">{s.label}</span>
                          <span className="settings-nav__item-desc">{s.description}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── RIGHT: SECTION CONTENT ──────────────────────────────────── */}
      <div className="settings-layout__content">
        <div className="settings-layout__bar">
          <button
            type="button"
            className="settings-layout__back"
            onClick={() => setDetailOpen(false)}
          >
            <IconChevronLeft size={18} />
            Settings
          </button>
        </div>
        <div className="settings-layout__detail-title">{activeLabel}</div>
        {children}
      </div>
    </div>
  );
}
