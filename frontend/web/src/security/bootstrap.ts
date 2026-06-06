import { refreshAccessToken } from "@/api/auth";
import { isEncryptedBlob } from "./crypto";
import { getCachedSession, persistSession, refreshSessionCache } from "./sessionCache";

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
  await migrateLegacySession();
  await refreshSessionCache();
  const cached = getCachedSession();
  if (!cached?.accessToken) {
    await refreshAccessToken();
    await refreshSessionCache();
  }
}
