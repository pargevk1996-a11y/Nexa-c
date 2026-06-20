import { useState } from "react";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";

const MOCK_STORAGE = [
  { label: "Photos & Videos", mb: 312 },
  { label: "Voice messages", mb: 48 },
  { label: "Documents", mb: 27 },
  { label: "App cache", mb: 14 },
];

const TOTAL_MB = MOCK_STORAGE.reduce((s, r) => s + r.mb, 0);

export function StorageSettingsSection() {
  const [autoClean, setAutoClean] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);

  return (
    <div className="settings-section">
      <p className="settings-section__lead">
        See how much space Nexa is using and set automatic cleanup rules.
      </p>

      <div className="settings-storage-bar">
        {MOCK_STORAGE.map((r) => (
          <span
            key={r.label}
            className="settings-storage-bar__segment"
            style={{ width: `${(r.mb / TOTAL_MB) * 100}%` }}
            title={`${r.label}: ${r.mb} MB`}
          />
        ))}
      </div>
      <ul className="settings-storage-legend">
        {MOCK_STORAGE.map((r) => (
          <li key={r.label} className="settings-storage-legend__item">
            <span className="settings-storage-legend__label">{r.label}</span>
            <span className="settings-storage-legend__size">{r.mb} MB</span>
          </li>
        ))}
        <li className="settings-storage-legend__item settings-storage-legend__item--total">
          <span className="settings-storage-legend__label">Total</span>
          <span className="settings-storage-legend__size">{TOTAL_MB} MB</span>
        </li>
      </ul>

      <div className="settings-group">
        <h3 className="settings-group__title">Cleanup</h3>
        <div className="settings-card">
          <SettingRow
            title="Automatically delete old media"
            description="Remove photos and videos older than 30 days."
          >
            <Toggle label="Automatically delete old media" checked={autoClean} onChange={setAutoClean} />
          </SettingRow>
          <SettingRow
            title="Data saver"
            description="Only download media when on Wi-Fi."
          >
            <Toggle label="Data saver" checked={dataSaver} onChange={setDataSaver} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <button type="button" className="settings-danger-btn settings-danger-btn--soft">
          Clear app cache
        </button>
      </div>
    </div>
  );
}
