import { apiFetch } from "./client";
import type { NotificationPlatform, NotificationPreferences } from "@/notifications/types";

const BASE = "/notifications";

export async function getGlobalNotificationPrefs(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>(`${BASE}/preferences`);
}

export async function putGlobalNotificationPrefs(
  body: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>(`${BASE}/preferences`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getChatNotificationPrefs(
  conversationId: string,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>(`${BASE}/preferences/${conversationId}`);
}

export async function putChatNotificationPrefs(
  conversationId: string,
  body: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>(`${BASE}/preferences/${conversationId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function registerPushSubscription(opts: {
  platform: NotificationPlatform;
  endpoint: string;
  keys?: Record<string, string>;
  deviceName?: string;
}): Promise<{ id: string }> {
  return apiFetch(`${BASE}/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      platform: opts.platform,
      endpoint: opts.endpoint,
      keys: opts.keys,
      device_name: opts.deviceName,
    }),
  });
}
