import { useEffect, useState } from "react";
import { SignaturePinModal } from "@/components/settings/SignaturePinModal";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";
import { setScreenshotAllowed } from "@/security/screenshotPolicy";
import { useSettings } from "@/store/SettingsContext";
import { useProfile } from "@/store/ProfileContext";
import { DEFAULT_PROFILE_PRIVACY, type ProfilePrivacy } from "@/types/profile";
import { Button } from "@/components/ui/Button";

export function PrivacySettingsSection() {
  const { settings, update } = useSettings();
  const { profile, save } = useProfile();
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(DEFAULT_PROFILE_PRIVACY);
  const [message, setMessage] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.privacy) setPrivacy(profile.privacy);
  }, [profile]);

  async function savePrivacy() {
    try {
      await save({ privacy });
      setMessage("Privacy settings saved");
    } catch {
      setMessage("Could not save — using local preferences only");
    }
  }

  function patchPrivacy<K extends keyof ProfilePrivacy>(key: K, value: ProfilePrivacy[K]) {
    setPrivacy((p) => ({ ...p, [key]: value }));
  }

  function handleScreenshotsToggle(enabled: boolean) {
    if (!enabled) {
      update("allowScreenshots", false);
      setScreenshotAllowed(false);
      return;
    }
    setSignatureModalOpen(true);
  }

  return (
    <section className="settings-group">
      <h2>Privacy</h2>
      <p className="settings-section__lead">Control who can see your activity and profile details.</p>
      <SignaturePinModal
        open={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSuccess={() => {
          update("allowScreenshots", true);
          setScreenshotAllowed(true);
          setMessage("Screenshots are now allowed on this device");
        }}
        title="Allow screenshots"
      />
      <div className="settings-card">
        <SettingRow
          title="Allow screenshots"
          description="Off by default. Enter your signature (4–6 digits) to enable."
        >
          <Toggle
            label="Allow screenshots"
            checked={settings.allowScreenshots}
            onChange={handleScreenshotsToggle}
          />
        </SettingRow>
        <SettingRow title="Read receipts" description="Let others know when you read their messages.">
          <Toggle
            label="Read receipts"
            checked={settings.readReceipts}
            onChange={(v) => update("readReceipts", v)}
          />
        </SettingRow>
        <SettingRow title="Show online status" description="Display when you are active in the app.">
          <Toggle
            label="Online status"
            checked={settings.showOnlineStatus}
            onChange={(v) => update("showOnlineStatus", v)}
          />
        </SettingRow>
        <SettingRow title="Last seen" description="Show last active time on your profile.">
          <Toggle
            label="Last seen visible"
            checked={settings.lastSeenVisible}
            onChange={(v) => update("lastSeenVisible", v)}
          />
        </SettingRow>
        <SettingRow title="Profile last seen" description="Server-side visibility for other users.">
          <Toggle
            label="Show last seen"
            checked={privacy.show_last_seen}
            onChange={(v) => patchPrivacy("show_last_seen", v)}
          />
        </SettingRow>
        <SettingRow title="Profile online" description="Whether others see you as online.">
          <Toggle
            label="Show online on profile"
            checked={privacy.show_online_status}
            onChange={(v) => patchPrivacy("show_online_status", v)}
          />
        </SettingRow>
        <SettingRow title="Bio visibility" description="Who can read your bio.">
          <Toggle label="Show bio" checked={privacy.show_bio} onChange={(v) => patchPrivacy("show_bio", v)} />
        </SettingRow>
        <SettingRow title="Avatar visibility" description="Show profile photo to others.">
          <Toggle
            label="Show avatar"
            checked={privacy.show_avatar}
            onChange={(v) => patchPrivacy("show_avatar", v)}
          />
        </SettingRow>
        <SettingRow title="Discoverable by username" description="Allow search by @username.">
          <Toggle
            label="Search by username"
            checked={privacy.allow_search_by_username}
            onChange={(v) => patchPrivacy("allow_search_by_username", v)}
          />
        </SettingRow>
        {message ? <div className="auth-alert auth-alert--info">{message}</div> : null}
        <div className="settings-card__actions">
          <Button type="button" variant="secondary" onClick={() => void savePrivacy()}>
            Save profile privacy
          </Button>
        </div>
      </div>
    </section>
  );
}
