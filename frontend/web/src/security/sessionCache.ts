import type { AuthSession } from "@/types";
import { removeSecureItem, wipeLocalSecurityState } from "./secureStorage";
import { storageKeys } from "./storageKeys";

// In-memory session cache. The server session lives in httpOnly cookies;
// we never write the full session to localStorage — only the user ID, so
// ProtectedRoute can distinguish "logged out" from "bootstrap in progress".
let cachedSession: AuthSession | null = null;

const UID_KEY = "securechat_active_uid_v1";

export function getCachedSession(): AuthSession | null {
  return cachedSession;
}

/** Returns the active user ID from memory, falling back to localStorage so
 *  ProtectedRoute does not redirect to /login on a transient refresh failure
 *  after a browser restart (memory cache is empty but user is still logged in). */
export function getActiveUserId(): string | null {
  if (cachedSession?.user?.id) return cachedSession.user.id;
  try { return localStorage.getItem(UID_KEY); } catch { return null; }
}

/** No-op: full session is no longer persisted to localStorage. */
export async function refreshSessionCache(): Promise<AuthSession | null> {
  return cachedSession;
}

/** Store session in memory, persist user ID hint, and fire the app-wide event. */
export async function persistSession(session: AuthSession): Promise<void> {
  cachedSession = session;
  try { localStorage.setItem(UID_KEY, session.user.id); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("securechat-session"));
}

export async function clearSession(): Promise<void> {
  cachedSession = null;
  // Remove any leftover legacy localStorage data from previous versions.
  try {
    localStorage.removeItem("securechat_active_uid_v1");
    localStorage.removeItem(storageKeys.session);
    localStorage.removeItem("nexa-screen-lock");
    localStorage.removeItem("_nxgu");
    sessionStorage.removeItem("_nxtu");
  } catch { /* ignore */ }
  try { removeSecureItem(storageKeys.session); } catch { /* ignore */ }
  await wipeLocalSecurityState();
}
