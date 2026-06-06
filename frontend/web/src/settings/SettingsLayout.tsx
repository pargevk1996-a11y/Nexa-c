import type { ReactNode } from "react";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./types";

interface SettingsLayoutProps {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  children: ReactNode;
}

export function SettingsLayout({ active, onSelect, children }: SettingsLayoutProps) {
  const groups = [...new Set(SETTINGS_SECTIONS.map((s) => s.group))];

  return (
    <div className="settings-layout">
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
                    onClick={() => onSelect(s.id)}
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
      <div className="settings-layout__content">{children}</div>
    </div>
  );
}
