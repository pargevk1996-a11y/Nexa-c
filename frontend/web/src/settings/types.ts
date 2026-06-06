export type SettingsSectionId =
  | "account"
  | "privacy"
  | "security"
  | "devices"
  | "sessions"
  | "blocked"
  | "notifications"
  | "appearance"
  | "danger";

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string; group: string }[] = [
  { id: "account", label: "Account", group: "Profile" },
  { id: "privacy", label: "Privacy", group: "Profile" },
  { id: "appearance", label: "Theme & display", group: "App" },
  { id: "notifications", label: "Notifications", group: "App" },
  { id: "security", label: "Security", group: "Protection" },
  { id: "devices", label: "Devices & sessions", group: "Protection" },
  { id: "sessions", label: "Session history", group: "Protection" },
  { id: "blocked", label: "Blocked users", group: "Protection" },
  { id: "danger", label: "Delete account", group: "Data" },
];
