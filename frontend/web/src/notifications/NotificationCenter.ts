/**
 * Unified notification delivery: desktop (browser), mobile Web Push, silent, grouping, smart mute.
 */

import type { AppSettings } from "@/store/settings";
import { enqueueGroupedNotification } from "./grouping";
import { extractMentions, shouldShowNotification } from "./smartMute";
import type { NotificationPreferences, NotifyPayload } from "./types";

let permissionRequested = false;
let globalPrefs: NotificationPreferences | null = null;
const chatPrefsCache = new Map<string, NotificationPreferences>();
const chatMuteLocal = new Map<string, boolean>();

export function setGlobalNotificationPrefs(prefs: NotificationPreferences | null): void {
  globalPrefs = prefs;
}

export function setChatNotificationPrefs(conversationId: string, prefs: NotificationPreferences | null): void {
  if (prefs) chatPrefsCache.set(conversationId, prefs);
  else chatPrefsCache.delete(conversationId);
}

export function setChatMutedLocal(conversationId: string, muted: boolean): void {
  chatMuteLocal.set(conversationId, muted);
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  if (permissionRequested) return Notification.permission;
  permissionRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function playMessageSound(enabled: boolean): void {
  if (!enabled || typeof Audio === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.04;
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* ignore */
  }
}

function showDesktopNotification(
  opts: NotifyPayload & { count?: number },
  settings: AppSettings,
): void {
  if (!settings.desktopNotifications) return;
  if (typeof document !== "undefined" && !document.hidden) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const useNative = settings.macNativeNotifications && /Mac/.test(navigator.platform);
  const tag = `nexa-msg-${opts.conversationId}`;
  const title = opts.count && opts.count > 1 ? `${opts.title} (${opts.count} new)` : opts.title;

  try {
    const n = new Notification(title, {
      body: opts.body.slice(0, 180),
      tag,
      silent: Boolean(opts.silent),
      // @ts-expect-error non-standard macOS hint
      renotify: true,
    });
    if (useNative) {
      n.onclick = () => {
        window.focus();
        window.location.href = `/app/chats?c=${encodeURIComponent(opts.conversationId)}`;
        n.close();
      };
    } else {
      n.onclick = () => {
        window.focus();
        window.location.href = `/app/chats?c=${encodeURIComponent(opts.conversationId)}`;
        n.close();
      };
    }
  } catch {
    /* ignore */
  }
}

/** Register Web Push when service worker + VAPID are configured (production). */
export async function registerWebPushSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });
    const { registerPushSubscription } = await import("@/api/notifications");
    const json = sub.toJSON();
    await registerPushSubscription({
      platform: isMobileDevice() ? "fcm" : "web",
      endpoint: json.endpoint ?? sub.endpoint,
      keys: json.keys as Record<string, string> | undefined,
      deviceName: navigator.userAgent.slice(0, 80),
    });
  } catch {
    /* push optional */
  }
}

function prefsFromAppSettings(s: AppSettings): NotificationPreferences {
  return {
    user_id: "",
    conversation_id: null,
    mute_until: null,
    mute_all: false,
    mentions_only: s.smartMuteMentionsOnly,
    push_enabled: s.pushNotifications,
    desktop_enabled: s.desktopNotifications,
    mobile_enabled: s.mobileNotifications,
    preview: true,
    sound: s.soundEnabled,
    quiet_hours_enabled: s.quietHoursEnabled,
    quiet_hours_start: s.quietHoursStart,
    quiet_hours_end: s.quietHoursEnd,
    group_notifications: s.notificationGrouping,
  };
}

export function notifyNewMessage(
  opts: NotifyPayload,
  settings: AppSettings = {
    desktopNotifications: true,
    macNativeNotifications: true,
    soundEnabled: true,
  } as AppSettings,
): void {
  const effectiveGlobal = globalPrefs ?? prefsFromAppSettings(settings);
  const mentionUserIds = opts.mentionUserIds ?? extractMentions(opts.body);
  const { allow, reason } = shouldShowNotification({
    globalPrefs: effectiveGlobal,
    chatPrefs: chatPrefsCache.get(opts.conversationId) ?? null,
    chatMuted: chatMuteLocal.get(opts.conversationId),
    mentionUserIds,
    currentUserId: opts.currentUserId,
    silent: opts.silent,
  });

  if (!allow && reason !== "silent") return;

  const mobile = isMobileDevice();
  const g = effectiveGlobal;
  const c = chatPrefsCache.get(opts.conversationId);
  const pushOn = (c?.push_enabled ?? g?.push_enabled ?? true) && settings.desktopNotifications;
  const desktopOn = (c?.desktop_enabled ?? g?.desktop_enabled ?? true) && settings.desktopNotifications;
  const mobileOn = (c?.mobile_enabled ?? g?.mobile_enabled ?? true);

  const deliver = (payload: NotifyPayload & { count?: number }) => {
    if (payload.silent) {
      if (desktopOn && !mobile) showDesktopNotification(payload, settings);
      return;
    }
    const sound =
      (c?.sound ?? g?.sound ?? settings.soundEnabled) && !payload.silent;
    if (sound) playMessageSound(true);
    // Vibration on devices that support it (mobile browsers; ignored elsewhere).
    if (sound && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(200);
      } catch {
        /* unsupported */
      }
    }

    if (mobile && mobileOn && pushOn) {
      showDesktopNotification(payload, settings);
    } else if (desktopOn) {
      showDesktopNotification(payload, settings);
    }
  };

  const groupEnabled = c?.group_notifications ?? g?.group_notifications ?? true;

  if (groupEnabled) {
    enqueueGroupedNotification(
      opts.conversationId,
      { title: opts.title, body: opts.body, silent: opts.silent },
      (g) => deliver({ ...opts, title: g.title, body: g.body, count: g.count, silent: g.silent }),
    );
  } else {
    deliver(opts);
  }
}
