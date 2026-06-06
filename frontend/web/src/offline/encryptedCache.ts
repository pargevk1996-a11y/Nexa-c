/**
 * Encrypted payloads in IndexedDB (user-bound AES-GCM via device + user key).
 */

import { IDB_STORES, idbGet, idbPut } from "@/cache/idb";
import { decryptJson, encryptJson, type EncryptedBlob } from "@/security/crypto";
import { deriveUserDataKey } from "@/security/crypto";

function cacheKey(userId: string, key: string): string {
  return `enc:${userId}:${key}`;
}

export async function setEncryptedCache<T>(userId: string, key: string, value: T): Promise<void> {
  const dataKey = await deriveUserDataKey(userId);
  const blob = await encryptJson(dataKey, value);
  await idbPut(IDB_STORES.kv, cacheKey(userId, key), blob);
}

export async function getEncryptedCache<T>(userId: string, key: string): Promise<T | null> {
  const raw = await idbGet<EncryptedBlob>(IDB_STORES.kv, cacheKey(userId, key));
  if (!raw) return null;
  try {
    const dataKey = await deriveUserDataKey(userId);
    return await decryptJson<T>(dataKey, raw);
  } catch {
    return null;
  }
}
