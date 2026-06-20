import { useState } from "react";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";
import { useSettings } from "@/store/SettingsContext";

const FONT_SIZES = ["Small", "Default", "Large", "Extra Large"] as const;
type FontSize = (typeof FONT_SIZES)[number];

export function AccessibilitySettingsSection() {
  const { settings, update } = useSettings();
  const [fontSize, setFontSize] = useState<FontSize>("Default");
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [largeTouchTargets, setLargeTouchTargets] = useState(false);

  return (
    <div className="settings-section">
      <p className="settings-section__lead">
        Make Nexa easier to use for your eyes, hands, and motion preferences.
      </p>

      <div className="settings-group">
        <h3 className="settings-group__title">Text</h3>
        <div className="settings-card">
          <SettingRow title="Font size" description="Affects all text in the app.">
            <div className="settings-font-size-row">
              {FONT_SIZES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`settings-font-size-btn${fontSize === f ? " settings-font-size-btn--active" : ""}`}
                  onClick={() => setFontSize(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title="High contrast" description="Increases contrast between text and background.">
            <Toggle label="High contrast" checked={highContrast} onChange={setHighContrast} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Motion</h3>
        <div className="settings-card">
          <SettingRow
            title="Reduce animations"
            description="Fewer transitions and motion effects."
          >
            <Toggle label="Reduce animations" checked={reducedMotion} onChange={setReducedMotion} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Interaction</h3>
        <div className="settings-card">
          <SettingRow
            title="Larger touch targets"
            description="Bigger tap areas for buttons and links."
          >
            <Toggle label="Larger touch targets" checked={largeTouchTargets} onChange={setLargeTouchTargets} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Appearance</h3>
        <div className="settings-card">
          <SettingRow title="Theme" description="Light, dark, or follow your system setting.">
            <div className="settings-card__actions">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`settings-theme-btn${settings.theme === t ? " settings-theme-btn--active" : ""}`}
                  onClick={() => update("theme", t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
