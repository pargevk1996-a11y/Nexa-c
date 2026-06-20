export type SettingsSectionId =
  | "account"
  | "privacy"
  | "security"
  | "devices"
  | "sessions"
  | "blocked"
  | "notifications"
  | "appearance"
  | "danger"
  | "calls"
  | "storage"
  | "accessibility"
  | "help"
  | "advanced";

export const SETTINGS_SECTIONS: {
  id: SettingsSectionId;
  label: string;
  description: string;
  group: string;
  color: string;
}[] = [
  {
    id: "account",
    label: "Account",
    description: "Phone, email, username, password",
    group: "You",
    color: "#3b82f6",
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Who can contact or see you",
    group: "Privacy & Safety",
    color: "#22c55e",
  },
  {
    id: "security",
    label: "Security",
    description: "2FA, passkeys, login history",
    group: "Privacy & Safety",
    color: "#10b981",
  },
  {
    id: "sessions",
    label: "Active sessions",
    description: "Devices signed in right now",
    group: "Privacy & Safety",
    color: "#8b5cf6",
  },
  {
    id: "blocked",
    label: "Blocked users",
    description: "People you have blocked",
    group: "Privacy & Safety",
    color: "#ef4444",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Sounds, badges, quiet hours",
    group: "Messages & Calls",
    color: "#f97316",
  },
  {
    id: "appearance",
    label: "Chats & Appearance",
    description: "Theme, font, bubbles, wallpaper",
    group: "Messages & Calls",
    color: "#6366f1",
  },
  {
    id: "calls",
    label: "Calls",
    description: "Audio, video, noise cancellation",
    group: "Messages & Calls",
    color: "#14b8a6",
  },
  {
    id: "devices",
    label: "Devices",
    description: "Trusted phones, tablets, desktops",
    group: "System",
    color: "#a855f7",
  },
  {
    id: "storage",
    label: "Storage & Data",
    description: "Cache, downloads, auto-cleanup",
    group: "System",
    color: "#0ea5e9",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    description: "Font size, contrast, reduced motion",
    group: "System",
    color: "#f59e0b",
  },
  {
    id: "help",
    label: "Help & Support",
    description: "FAQ, contact us, report a bug",
    group: "More",
    color: "#64748b",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Developer tools, diagnostics",
    group: "More",
    color: "#475569",
  },
  {
    id: "danger",
    label: "Delete account",
    description: "Permanently remove your data",
    group: "More",
    color: "#ef4444",
  },
];
