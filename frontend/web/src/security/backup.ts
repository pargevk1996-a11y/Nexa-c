import { deriveUserDataKey, encryptJson } from "./crypto";
import { getSecureItem } from "./secureStorage";
import { storageKeys } from "./storageKeys";

/** Export encrypted local backup (privacy-first: stays on device until user saves file). */
export async function exportEncryptedBackup(userId: string): Promise<Blob> {
  const key = await deriveUserDataKey(userId);
  const session = await getSecureItem(storageKeys.session, userId);
  const settings = await getSecureItem(storageKeys.settings(userId), userId);
  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    session,
    settings,
  };
  const blob = await encryptJson(key, payload);
  return new Blob([JSON.stringify(blob)], { type: "application/json" });
}
