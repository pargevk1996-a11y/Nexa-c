import { useState } from "react";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";

export function CallsSettingsSection() {
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [hd, setHd] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);

  return (
    <div className="settings-section">
      <p className="settings-section__lead">
        Adjust audio and video quality for your calls.
      </p>

      <div className="settings-group">
        <h3 className="settings-group__title">Audio</h3>
        <div className="settings-card">
          <SettingRow title="Noise cancellation" description="Filter background noise during calls.">
            <Toggle label="Noise cancellation" checked={noiseCancellation} onChange={setNoiseCancellation} />
          </SettingRow>
          <SettingRow title="Echo cancellation" description="Prevent your voice from echoing for others.">
            <Toggle label="Echo cancellation" checked={echoCancellation} onChange={setEchoCancellation} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Video</h3>
        <div className="settings-card">
          <SettingRow title="HD video" description="Higher quality video — uses more data.">
            <Toggle label="HD video" checked={hd} onChange={setHd} />
          </SettingRow>
          <SettingRow title="Data saver" description="Reduce bandwidth during video calls.">
            <Toggle label="Data saver" checked={dataSaver} onChange={setDataSaver} />
          </SettingRow>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group__title">Privacy</h3>
        <div className="settings-card">
          <SettingRow
            title="Peer-to-peer calls"
            description="Off — your IP is always relayed through Nexa servers."
          >
            <Toggle label="Peer-to-peer calls" checked={privacyMode} onChange={setPrivacyMode} />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
