import {
  decryptJson,
  encryptJson,
  isEncryptedBlob,
  type EncryptedBlob,
} from "./crypto";
import { deriveUserDataKey } from "./crypto";
import { destroyDeviceKeyMaterial, hasDeviceKeyMaterial } from "./deviceKey";
import { clearSignatureForUser } from "./signaturePin";
import { storageKeys } from "./storageKeys";

export async function setSecureItem<T>(storageKey: string, userId: string, value: T): Promise<void> {
  const key = await deriveUserDataKey(userId);
  const blob = await encryptJson(key, value);
  localStorage.setItem(storageKey, JSON.stringify(blob));
}

export async function getSecureItem<T>(storageKey: string, userId: string): Promise<T | null> {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  if (!isEncryptedBlob(raw)) {
    return migratePlaintext<T>(raw, storageKey, userId);
  }

  const key = await deriveUserDataKey(userId);
  const blob = JSON.parse(raw) as EncryptedBlob;
  return decryptJson<T>(key, blob);
}

async function migratePlaintext<T>(raw: string, storageKey: string, userId: string): Promise<T | null> {
  try {
    const parsed = JSON.parse(raw) as T;
    await setSecureItem(storageKey, userId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function removeSecureItem(storageKey: string): void {
  localStorage.removeItem(storageKey);
}

export function clearUserSecureStorage(userId: string): void {
  removeSecureItem(storageKeys.session);
  removeSecureItem(storageKeys.settings(userId));
  removeSecureItem(storageKeys.panelLayout(userId));
  removeSecureItem(storageKeys.chatVault(userId));
  clearSignatureForUser(userId);
  localStorage.removeItem("securechat_demo_session");
  localStorage.removeItem("securechat_settings");
  localStorage.removeItem("securechat-panel-widths");
}

export function wipeLocalSecurityState(): void {
  destroyDeviceKeyMaterial();
}

export function securityStorageReady(): boolean {
  return hasDeviceKeyMaterial();
}
