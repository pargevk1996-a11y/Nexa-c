import { useEffect } from "react";
import { getGlobalNotificationPrefs } from "@/api/notifications";
import { getCachedSession } from "@/api/auth";
import { SettingRow, Toggle } from "@/components/settings/SettingRow";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { registerWebPushSubscription, setGlobalNotificationPrefs } from "@/notifications/NotificationCenter";
import { useSettings } from "@/store/SettingsContext";

export function NotificationSettingsSection() {
  const session = getCachedSession();
  const { settings, update } = useSettings();
  const { live, updateGlobal } = useNotificationPrefs();

  useEffect(() => {
    if (!live) return;
    void getGlobalNotificationPrefs()
      .then(setGlobalNotificationPrefs)
      .catch(() => undefined);
  }, [live]);

  async function syncNotifPrefs(patch: Parameters<typeof updateGlobal>[0]) {
    if (live) {
      try {
        await updateGlobal(patch);
      } catch {
        /* local only */
      }
    }
  }

  return (
    <section className="settings-group">
      <h2>Notifications</h2>
      <p className="settings-section__lead">Push, desktop, mobile alerts, grouping, and quiet hours.</p>
      <div className="settings-card">
        <SettingRow title="Desktop notifications" description="Browser alerts when the tab is in the background.">
          <Toggle
            label="Desktop"
            checked={settings.desktopNotifications}
            onChange={(v) => {
              update("desktopNotifications", v);
              void syncNotifPrefs({ desktop_enabled: v, push_enabled: v });
            }}
          />
        </SettingRow>
        <SettingRow title="Push notifications" description="Web Push when service worker is enabled.">
          <Toggle
            label="Push"
            checked={settings.pushNotifications}
            onChange={(v) => {
              update("pushNotifications", v);
              void syncNotifPrefs({ push_enabled: v });
              if (v && session) void registerWebPushSubscription();
            }}
          />
        </SettingRow>
        <SettingRow title="Mobile notifications" description="Alerts on phones and tablets.">
          <Toggle
            label="Mobile"
            checked={settings.mobileNotifications}
            onChange={(v) => {
              update("mobileNotifications", v);
              void syncNotifPrefs({ mobile_enabled: v });
            }}
          />
        </SettingRow>
        <SettingRow title="Group notifications" description="Collapse multiple messages per chat.">
          <Toggle
            label="Grouping"
            checked={settings.notificationGrouping}
            onChange={(v) => {
              update("notificationGrouping", v);
              void syncNotifPrefs({ group_notifications: v });
            }}
          />
        </SettingRow>
        <SettingRow title="Mentions while muted" description="Still notify on @mentions when chat is muted.">
          <Toggle
            label="Smart mute mentions"
            checked={settings.smartMuteMentionsOnly}
            onChange={(v) => {
              update("smartMuteMentionsOnly", v);
              void syncNotifPrefs({ mentions_only: v });
            }}
          />
        </SettingRow>
        <SettingRow title="Quiet hours" description="Suppress banners during selected hours.">
          <Toggle
            label="Quiet hours"
            checked={settings.quietHoursEnabled}
            onChange={(v) => {
              update("quietHoursEnabled", v);
              void syncNotifPrefs({ quiet_hours_enabled: v });
            }}
          />
        </SettingRow>
        {settings.quietHoursEnabled ? (
          <SettingRow title="Quiet schedule" description="Local time (24h).">
            <div className="settings-quiet-hours">
              <input
                type="time"
                value={settings.quietHoursStart}
                onChange={(e) => {
                  update("quietHoursStart", e.target.value);
                  void syncNotifPrefs({ quiet_hours_start: e.target.value });
                }}
                aria-label="Quiet start"
              />
              <span>to</span>
              <input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(e) => {
                  update("quietHoursEnd", e.target.value);
                  void syncNotifPrefs({ quiet_hours_end: e.target.value });
                }}
                aria-label="Quiet end"
              />
            </div>
          </SettingRow>
        ) : null}
        <SettingRow title="Mac notification center" description="Prefer native macOS alerts.">
          <Toggle
            label="Mac notifications"
            checked={settings.macNativeNotifications}
            onChange={(v) => update("macNativeNotifications", v)}
          />
        </SettingRow>
        <SettingRow title="Message sounds" description="Play a sound for new messages in-app.">
          <Toggle
            label="Sounds"
            checked={settings.soundEnabled}
            onChange={(v) => {
              update("soundEnabled", v);
              void syncNotifPrefs({ sound: v });
            }}
          />
        </SettingRow>
      </div>
    </section>
  );
}
