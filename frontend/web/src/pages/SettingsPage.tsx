import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SettingsLayout } from "@/settings/SettingsLayout";
import { AccountSettingsSection } from "@/settings/sections/AccountSettingsSection";
import { AccountDeletionSection } from "@/settings/sections/AccountDeletionSection";
import { BlockedUsersSection } from "@/settings/sections/BlockedUsersSection";
import { DevicesSettingsSection } from "@/settings/sections/DevicesSettingsSection";
import { NotificationSettingsSection } from "@/settings/sections/NotificationSettingsSection";
import { PrivacySettingsSection } from "@/settings/sections/PrivacySettingsSection";
import { SecuritySettingsSection } from "@/settings/sections/SecuritySettingsSection";
import { SessionsSettingsSection } from "@/settings/sections/SessionsSettingsSection";
import { ThemeSettingsSection } from "@/settings/sections/ThemeSettingsSection";
import { CallsSettingsSection } from "@/settings/sections/CallsSettingsSection";
import { StorageSettingsSection } from "@/settings/sections/StorageSettingsSection";
import { AccessibilitySettingsSection } from "@/settings/sections/AccessibilitySettingsSection";
import { HelpSettingsSection } from "@/settings/sections/HelpSettingsSection";
import { AdvancedSettingsSection } from "@/settings/sections/AdvancedSettingsSection";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/settings/types";

const VALID = SETTINGS_SECTIONS.map((s) => s.id);

function parseSection(raw: string | null): SettingsSectionId {
  if (raw && (VALID as string[]).includes(raw)) return raw as SettingsSectionId;
  return "account";
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const active = parseSection(params.get("section"));

  function setSection(id: SettingsSectionId) {
    setParams({ section: id }, { replace: true });
  }

  const content = useMemo(() => {
    switch (active) {
      case "account":       return <AccountSettingsSection />;
      case "privacy":       return <PrivacySettingsSection />;
      case "security":      return <SecuritySettingsSection />;
      case "devices":       return <DevicesSettingsSection />;
      case "sessions":      return <SessionsSettingsSection />;
      case "blocked":       return <BlockedUsersSection />;
      case "notifications": return <NotificationSettingsSection />;
      case "appearance":    return <ThemeSettingsSection />;
      case "calls":         return <CallsSettingsSection />;
      case "storage":       return <StorageSettingsSection />;
      case "accessibility": return <AccessibilitySettingsSection />;
      case "help":          return <HelpSettingsSection />;
      case "advanced":      return <AdvancedSettingsSection />;
      case "danger":        return <AccountDeletionSection />;
      default:              return <AccountSettingsSection />;
    }
  }, [active]);

  return (
    <div className="page-shell page-shell--settings">
      <div className="settings-page-layout page-shell__inner glass-panel">
        <SettingsLayout active={active} onSelect={setSection}>
          {content}
        </SettingsLayout>
      </div>
    </div>
  );
}
