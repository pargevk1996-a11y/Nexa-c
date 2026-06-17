import { useState, type ReactNode } from "react";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./types";

interface SettingsLayoutProps {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  children: ReactNode;
}

export function SettingsLayout({ active, onSelect, children }: SettingsLayoutProps) {
  const groups = [...new Set(SETTINGS_SECTIONS.map((s) => s.group))];
  // Mobile drill-in: start on the section list; opening a section reveals its
  // content full-width with a back button. Desktop ignores this (CSS keeps both
  // panes side-by-side).
  const [detailOpen, setDetailOpen] = useState(false);
  const activeLabel = SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "Settings";

  return (
    <div className={`settings-layout ${detailOpen ? "settings-layout--detail-open" : ""}`}>
      <nav className="settings-nav" aria-label="Settings sections">
        {groups.map((group) => (
          <div key={group} className="settings-nav__group">
            <span className="settings-nav__group-label">{group}</span>
            <ul className="settings-nav__list">
              {SETTINGS_SECTIONS.filter((s) => s.group === group).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`settings-nav__item ${active === s.id ? "settings-nav__item--active" : ""}`}
                    onClick={() => {
                      onSelect(s.id);
                      setDetailOpen(true);
                    }}
                    aria-current={active === s.id ? "page" : undefined}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="settings-layout__content">
        {/* Mobile-only top bar: back-to-list (left) + logo/theme-toggle (right).
            Hidden on desktop via CSS. */}
        <div className="settings-layout__bar">
          <button
            type="button"
            className="settings-layout__back"
            onClick={() => setDetailOpen(false)}
          >
            <span aria-hidden>‹</span> Settings
          </button>
          <LogoThemeToggle size={36} className="settings-layout__logo" />
        </div>
        <div className="settings-layout__detail-title">{activeLabel}</div>
        {children}
      </div>
    </div>
  );
}
