import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getCachedSession } from "@/api/auth";
import { Button } from "@/components/ui/Button";
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
import type { SettingsSectionId } from "@/settings/types";
import { useSettings } from "@/store/SettingsContext";

const VALID: SettingsSectionId[] = [
  "account",
  "privacy",
  "security",
  "devices",
  "sessions",
  "blocked",
  "notifications",
  "appearance",
  "danger",
];

function parseSection(raw: string | null): SettingsSectionId {
  if (raw && (VALID as string[]).includes(raw)) return raw as SettingsSectionId;
  return "account";
}

export function SettingsPage() {
  const session = getCachedSession();
  const [params, setParams] = useSearchParams();
  const active = parseSection(params.get("section"));
  const { resetAll } = useSettings();

  function setSection(id: SettingsSectionId) {
    setParams({ section: id }, { replace: true });
  }

  const content = useMemo(() => {
    switch (active) {
      case "account":
        return <AccountSettingsSection />;
      case "privacy":
        return <PrivacySettingsSection />;
      case "security":
        return <SecuritySettingsSection />;
      case "devices":
        return <DevicesSettingsSection />;
      case "sessions":
        return <SessionsSettingsSection />;
      case "blocked":
        return <BlockedUsersSection />;
      case "notifications":
        return <NotificationSettingsSection />;
      case "appearance":
        return <ThemeSettingsSection />;
      case "danger":
        return <AccountDeletionSection />;
      default:
        return <AccountSettingsSection />;
    }
  }, [active]);

  return (
    <div className="page-shell page-shell--settings">
      <div className="settings-page-layout page-shell__inner glass-panel">
        <header className="settings-page__header">
          <h1>Settings</h1>
          {session ? (
            <p>
              Signed in as <strong>{session.user.username}</strong>
            </p>
          ) : null}
          <div className="settings-page__header-actions">
            <Button variant="secondary" type="button" onClick={resetAll}>
              Reset app preferences
            </Button>
          </div>
        </header>

        <SettingsLayout active={active} onSelect={setSection}>
          {content}
        </SettingsLayout>
      </div>
    </div>
  );
}
