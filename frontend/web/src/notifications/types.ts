export type NotificationPlatform = "web" | "fcm" | "apns" | "desktop";

export interface NotificationPreferences {
  user_id: string;
  conversation_id: string | null;
  mute_until: string | null;
  mute_all: boolean;
  mentions_only: boolean;
  push_enabled: boolean;
  desktop_enabled: boolean;
  mobile_enabled: boolean;
  preview: boolean;
  sound: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  group_notifications: boolean;
}

export interface NotifyPayload {
  title: string;
  body: string;
  conversationId: string;
  silent?: boolean;
  mentionUserIds?: string[];
  currentUserId?: string;
}
