import { STORY_PHOTO_DURATION_OPTIONS } from "@/store/settings";
import type { AppSettings, FontSize, ThemeMode } from "@/store/settings";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";
import { useSettings } from "@/store/SettingsContext";

export function ThemeSettingsSection() {
  const { settings, update } = useSettings();

  // Platform detection: shortcuts show the correct modifier, and the desktop-app
  // menu-bar setting is hidden in a plain web browser.
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? "⌘" : "Ctrl";
  const isDesktopApp =
    typeof window !== "undefined" &&
    ("__TAURI__" in window || /electron/i.test(navigator.userAgent));

  return (
    <>
      <section className="settings-group">
        <h2>Theme & display</h2>
        <p className="settings-section__lead">Appearance, typography, and chat list density.</p>
        <div className="settings-card">
          <SettingRow title="Theme" description="Dark, light, or match system.">
            <select
              className="field__input settings-select"
              value={settings.theme}
              onChange={(e) => update("theme", e.target.value as ThemeMode)}
              aria-label="Theme"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </select>
          </SettingRow>
          <SettingRow title="Text size" description="Base font size for the app.">
            <select
              className="field__input settings-select"
              value={settings.fontSize}
              onChange={(e) => update("fontSize", e.target.value as FontSize)}
              aria-label="Font size"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </SettingRow>
          <SettingRow title="Compact chat list" description="Show more conversations on screen.">
            <Toggle
              label="Compact list"
              checked={settings.compactChat}
              onChange={(v) => update("compactChat", v)}
            />
          </SettingRow>
          <SettingRow title="Enter to send" description="Shift+Enter for new line.">
            <Toggle
              label="Enter to send"
              checked={settings.enterToSend}
              onChange={(v) => update("enterToSend", v)}
            />
          </SettingRow>
          <SettingRow title="Navigation buttons" description="Show bottom navigation buttons on mobile.">
            <Toggle
              label="Navigation buttons"
              checked={settings.showNavButtons}
              onChange={(v) => update("showNavButtons", v)}
            />
          </SettingRow>
        </div>
      </section>

      <section className="settings-group">
        <h2>Stories</h2>
        <div className="settings-card">
          <SettingRow title="Photo story duration" description="Time per photo slide.">
            <select
              className="field__input settings-select"
              value={settings.storyPhotoDurationSec}
              onChange={(e) =>
                update("storyPhotoDurationSec", Number(e.target.value) as AppSettings["storyPhotoDurationSec"])
              }
            >
              {STORY_PHOTO_DURATION_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </SettingRow>
        </div>
      </section>

      {isDesktopApp ? (
        <section className="settings-group">
          <h2>Desktop</h2>
          <div className="settings-card">
            <SettingRow title="Menu bar icon" description="Quick access from the menu bar (desktop app).">
              <Toggle
                label="Menu bar"
                checked={settings.macMenuBarIcon}
                onChange={(v) => update("macMenuBarIcon", v)}
              />
            </SettingRow>
          </div>
        </section>
      ) : null}

      <section className="settings-group">
        <h2>Keyboard shortcuts</h2>
        <div className="settings-card">
          <div className="settings-shortcuts">
            <ul>
              <li>
                <kbd>{modKey}</kbd> <kbd>K</kbd> — Search chats
              </li>
              <li>
                <kbd>{modKey}</kbd> <kbd>,</kbd> — Settings
              </li>
              <li>
                <kbd>Esc</kbd> — Close panels
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
