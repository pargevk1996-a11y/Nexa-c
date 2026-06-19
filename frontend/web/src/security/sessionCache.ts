import type { AuthSession } from "@/types";
import { getSecureItem, removeSecureItem, setSecureItem, wipeLocalSecurityState } from "./secureStorage";
import { storageKeys } from "./storageKeys";
import { getOrCreateDeviceBaseKey } from "./deviceKey";

// Active user id is stored in localStorage (NOT sessionStorage) so the session
// is SHARED across all tabs of the browser and survives tab close — one account
// per browser, not per tab. The encrypted session blob already lives in
// localStorage too. (Cross-browser/device login is a separate device-handover
// flow with PIN.)
const ACTIVE_UID_KEY = "securechat_active_uid_v1";

let cachedSession: AuthSession | null = null;

export function getCachedSession(): AuthSession | null {
  return cachedSession;
}

export function getActiveUserId(): string | null {
  return localStorage.getItem(ACTIVE_UID_KEY);
}

export async function refreshSessionCache(): Promise<AuthSession | null> {
  const uid = localStorage.getItem(ACTIVE_UID_KEY);
  if (!uid) {
    cachedSession = null;
    return null;
  }
  const restored = await getSecureItem<AuthSession>(storageKeys.session, uid);
  if (restored) {
    cachedSession = restored;
    return cachedSession;
  }
  // restored === null — distinguish "genuinely signed out" from a TRANSIENT
  // failure. getSecureItem returns null both when there is no stored blob AND
  // when an existing blob cannot be decrypted *right now* (device key in
  // IndexedDB not ready yet, a crypto/storage hiccup, or the key was just
  // regenerated under browser storage pressure). If the encrypted blob is still
  // present, treat it as transient: do NOT wipe the active-uid pointer and do
  // NOT downgrade a previously restored session to null — that would log the
  // user out on a momentary glitch and bounce them to the landing page. A later
  // refresh (focus, bootstrap retry, or /auth/refresh re-persist) recovers it.
  const blobPresent = localStorage.getItem(storageKeys.session) != null;
  if (blobPresent) {
    return cachedSession;
  }
  // No stored blob at all → genuinely signed out (or storage cleared).
  cachedSession = null;
  localStorage.removeItem(ACTIVE_UID_KEY);
  return null;
}

export async function persistSession(session: AuthSession): Promise<void> {
  // Ensure device base key exists before writing encrypted session data.
  await getOrCreateDeviceBaseKey();
  localStorage.setItem(ACTIVE_UID_KEY, session.user.id);
  // Mark this tab as explicitly unlocked so the new-tab lock doesn't re-trigger.
  sessionStorage.setItem(storageKeys.tabUnlocked, "1");
  await setSecureItem(storageKeys.session, session.user.id, session);
  cachedSession = session;
  window.dispatchEvent(new Event("securechat-session"));
}

export async function clearSession(): Promise<void> {
  const uid = localStorage.getItem(ACTIVE_UID_KEY);
  if (uid) {
    removeSecureItem(storageKeys.session);
  }
  localStorage.removeItem(ACTIVE_UID_KEY);
  sessionStorage.removeItem(storageKeys.tabUnlocked);
  try { localStorage.removeItem(storageKeys.globalUnlocked); } catch { /* ignore */ }
  // Drop the persistent screen-lock flag: a full logout / session reset is a
  // stronger gate than the PIN, so a restored lock must not strand a logged-out
  // user behind an unenterable PIN screen on the next load.
  try { localStorage.removeItem("nexa-screen-lock"); } catch { /* ignore */ }
  cachedSession = null;
  await wipeLocalSecurityState();
}

// Cross-tab sync: a login/logout (or remote session-kill) in ANY tab changes the
// shared active-uid in localStorage. The `storage` event fires only in OTHER
// tabs, so we re-read the shared session and notify the app — keeping every tab
// of the browser on the same account, and logging them all out together when the
// session dies. No loop risk (the originating tab doesn't receive the event).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== ACTIVE_UID_KEY) return;
    void refreshSessionCache().then(() => {
      window.dispatchEvent(new Event("securechat-session"));
    });
  });
}
