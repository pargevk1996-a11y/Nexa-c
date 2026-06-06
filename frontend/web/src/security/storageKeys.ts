export const storageKeys = {
  session: "securechat_session_v1",
  settings: (userId: string) => `securechat_settings_v1_${userId}`,
  panelLayout: (userId: string) => `securechat_panels_v1_${userId}`,
  chatVault: (userId: string) => `securechat_chat_vault_v1_${userId}`,
  // Per-tab unlock marker (sessionStorage): set when user explicitly unlocks in this tab.
  tabUnlocked: "_nxtu",
  // Cross-tab unlock state (localStorage): "1" = app is unlocked in at least one tab.
  // New tabs inherit this so they start in the same state as existing tabs.
  globalUnlocked: "_nxgu",
} as const;
