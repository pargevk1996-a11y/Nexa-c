import { useState } from "react";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";

export function AdvancedSettingsSection() {
  const [devMode, setDevMode] = useState(false);
  const [experimental, setExperimental] = useState(false);
  const [crashReports, setCrashReports] = useState(true);

  return (
    <div className="settings-section">
      <p className="settings-section__lead">
        These settings are for advanced users and developers.
      </p>

      <div className="settings-group">
        <h3 className="settings-group__title">Developer</h3>
        <div className="settings-card">
          <SettingRow
            title="Developer mode"
            description="Shows debug info and extra logging."
          >
            <Toggle label="Developer mode" checked={devMode} onChange={setDevMode} />
          </SettingRow>
          <SettingRow
            title="Experimental features"
            description="Try features before they're released. May be unstable."
          >
            <Toggle label="Experimental features" checked={experimental} onChange={setExperimental} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Diagnostics</h3>
        <div className="settings-card">
          <SettingRow
            title="Send crash reports"
            description="Help us fix bugs by sending anonymous crash data."
          >
            <Toggle label="Send crash reports" checked={crashReports} onChange={setCrashReports} />
          </SettingRow>
          <div className="settings-help-links">
            <button
              type="button"
              className="settings-nav-link"
              onClick={() => { /* placeholder — diagnostics UI coming */ }}
            >
              <span>Network diagnostics</span>
              <span className="settings-nav-link__chevron">›</span>
            </button>
            <button
              type="button"
              className="settings-nav-link"
              onClick={() => { /* placeholder — diagnostics UI coming */ }}
            >
              <span>Performance monitor</span>
              <span className="settings-nav-link__chevron">›</span>
            </button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Reset</h3>
        <button
          type="button"
          className="settings-danger-btn settings-danger-btn--soft"
          onClick={() => {
            if (confirm("Reset all settings to defaults?")) {
              localStorage.removeItem("nexa_settings");
              location.reload();
            }
          }}
        >
          Reset all settings
        </button>
      </div>
    </div>
  );
}
