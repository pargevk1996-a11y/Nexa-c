import { refreshAccessToken } from "@/api/auth";
import { isEncryptedBlob } from "./crypto";
import { getOrCreateDeviceBaseKey } from "./deviceKey";
import { getCachedSession, persistSession, refreshSessionCache } from "./sessionCache";
import { initDeviceKeyPair } from "./e2ee";

const LEGACY_SESSION_KEY = "securechat_demo_session";

/** One-time migration from legacy plaintext session key. */
async function migrateLegacySession(): Promise<void> {
  const raw = localStorage.getItem(LEGACY_SESSION_KEY);
  if (!raw || isEncryptedBlob(raw)) return;
  try {
    const parsed = JSON.parse(raw) as import("@/types").AuthSession;
    if (!parsed?.user?.id) return;
    await persistSession(parsed);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

export async function bootstrapSecurity(): Promise<void> {
  // Pre-warm: load (or generate) the device base key from IndexedDB before any
  // session-cache or storage reads. getOrCreateDeviceBaseKey() is idempotent.
  await getOrCreateDeviceBaseKey().catch(() => {});
  await migrateLegacySession();
  await refreshSessionCache();
  const cached = getCachedSession();
  if (!cached?.user?.id) {
    await refreshAccessToken();
    await refreshSessionCache();
  }
  // Init ECDH key pair and upload public key if the user is logged in.
  const session = getCachedSession();
  if (session?.user?.id) {
    await initDeviceKeyPair().catch(() => {});
  }
}
