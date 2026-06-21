import { getSecureItem, removeSecureItem, setSecureItem } from "./secureStorage";

const SIGNATURE_HASH_KEY = (userId: string) => `securechat_signature_hash_v1_${userId}`;
const PENDING_PREFIX = "nexa_pending_signature_v1_";

export function normalizeSignatureInput(raw: string): string {
  return raw.replace(/\s/g, "");
}

export function validateSignatureFormat(pin: string): string | null {
  const p = normalizeSignatureInput(pin);
  if (!/^\d{4,6}$/.test(p)) {
    return "PIN code must be 4–6 digits";
  }
  return null;
}

export async function hashSignature(pin: string): Promise<string> {
  const normalized = normalizeSignatureInput(pin);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeSignatureForUser(userId: string, pin: string): Promise<void> {
  const hash = await hashSignature(pin);
  await setSecureItem(SIGNATURE_HASH_KEY(userId), userId, hash);
}

export async function hasSignatureForUser(userId: string): Promise<boolean> {
  const hash = await getSecureItem<string>(SIGNATURE_HASH_KEY(userId), userId);
  return Boolean(hash);
}

/**
 * Synchronous "is a PIN already set on this device?" check based purely on the
 * presence of the stored (encrypted) blob — it does NOT attempt decryption.
 *
 * This is the security-critical gate for the lock screen's setup-vs-verify mode.
 * `hasSignatureForUser` returns false BOTH when no PIN exists AND when the blob
 * exists but can't be decrypted right now (device key not warm). Driving "setup
 * mode" off that lets a transient failure flip the lock into setup mode, where
 * the FIRST PIN typed is accepted and OVERWRITES the real signature — i.e. "any
 * PIN works on the first try". Gate setup on blob ABSENCE instead, so an
 * existing PIN is never silently replaced.
 */
export function hasStoredSignature(userId: string): boolean {
  return localStorage.getItem(SIGNATURE_HASH_KEY(userId)) !== null;
}

export async function verifySignatureForUser(userId: string, pin: string): Promise<boolean> {
  const stored = await getSecureItem<string>(SIGNATURE_HASH_KEY(userId), userId);
  if (!stored) return false;
  const attempt = await hashSignature(pin);
  return stored === attempt;
}

/** After register, before first login (no user id yet). */
export function storePendingSignatureForEmail(email: string, pin: string): void {
  void hashSignature(pin).then((hash) => {
    sessionStorage.setItem(`${PENDING_PREFIX}${email.trim().toLowerCase()}`, hash);
  });
}

export async function linkPendingSignatureForEmail(email: string, userId: string): Promise<void> {
  const key = `${PENDING_PREFIX}${email.trim().toLowerCase()}`;
  const hash = sessionStorage.getItem(key);
  if (!hash) return;
  await setSecureItem(SIGNATURE_HASH_KEY(userId), userId, hash);
  sessionStorage.removeItem(key);
}

export function clearSignatureForUser(userId: string): void {
  removeSecureItem(SIGNATURE_HASH_KEY(userId));
}
