import type { AuthSession } from "@/types";
import { getSecureItem, removeSecureItem, setSecureItem, wipeLocalSecurityState } from "./secureStorage";
import { storageKeys } from "./storageKeys";
import { getOrCreateDeviceKeyMaterial } from "./deviceKey";

const ACTIVE_UID_KEY = "securechat_active_uid_v1";

let cachedSession: AuthSession | null = null;

export function getCachedSession(): AuthSession | null {
  return cachedSession;
}

export function getActiveUserId(): string | null {
  return sessionStorage.getItem(ACTIVE_UID_KEY);
}

export async function refreshSessionCache(): Promise<AuthSession | null> {
  const uid = sessionStorage.getItem(ACTIVE_UID_KEY);
  if (!uid || !sessionStorage.getItem("securechat_device_material_v1")) {
    cachedSession = null;
    return null;
  }
  cachedSession = await getSecureItem<AuthSession>(storageKeys.session, uid);
  if (!cachedSession) {
    sessionStorage.removeItem(ACTIVE_UID_KEY);
  }
  return cachedSession;
}

export async function persistSession(session: AuthSession): Promise<void> {
  getOrCreateDeviceKeyMaterial();
  sessionStorage.setItem(ACTIVE_UID_KEY, session.user.id);
  // Mark this tab as explicitly unlocked so the new-tab lock doesn't re-trigger.
  sessionStorage.setItem(storageKeys.tabUnlocked, "1");
  await setSecureItem(storageKeys.session, session.user.id, session);
  cachedSession = session;
  window.dispatchEvent(new Event("securechat-session"));
}

export async function clearSession(): Promise<void> {
  const uid = sessionStorage.getItem(ACTIVE_UID_KEY);
  if (uid) {
    removeSecureItem(storageKeys.session);
  }
  sessionStorage.removeItem(ACTIVE_UID_KEY);
  sessionStorage.removeItem(storageKeys.tabUnlocked);
  try { localStorage.removeItem(storageKeys.globalUnlocked); } catch { /* ignore */ }
  cachedSession = null;
  wipeLocalSecurityState();
}
