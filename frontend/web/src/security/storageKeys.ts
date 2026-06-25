export const storageKeys = {
  session: "securechat_session_v1",
  settings: (userId: string) => `securechat_settings_v1_${userId}`,
  panelLayout: (userId: string) => `securechat_panels_v1_${userId}`,
  chatVault: (userId: string) => `securechat_chat_vault_v1_${userId}`,
} as const;
