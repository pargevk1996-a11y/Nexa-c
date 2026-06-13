import { base64ToBytes, bytesToBase64 } from "./b64";
import { getOrCreateDeviceBaseKey } from "./deviceKey";

const AES_ALG = "AES-GCM";
const AES_BITS = 256;
const IV_BYTES = 12;
const HKDF_SALT = "securechat-hkdf-v1";
const HKDF_INFO_PREFIX = "securechat-user-v1:";

export interface EncryptedBlob {
  v: 1;
  iv: string;
  ct: string;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveUserDataKey(userId: string): Promise<CryptoKey> {
  const baseKey = await getOrCreateDeviceBaseKey();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(HKDF_SALT),
      info: new TextEncoder().encode(`${HKDF_INFO_PREFIX}${userId}`),
    },
    baseKey,
    { name: AES_ALG, length: AES_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson<T>(key: CryptoKey, value: T): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALG, iv }, key, plaintext);
  return {
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T | null> {
  try {
    if (blob.v !== 1) return null;
    const iv = base64ToBytes(blob.iv);
    const ct = base64ToBytes(blob.ct);
    const plaintext = await crypto.subtle.decrypt(
      { name: AES_ALG, iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ct),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function isEncryptedBlob(raw: string): boolean {
  if (!raw.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<EncryptedBlob>;
    return parsed.v === 1 && typeof parsed.iv === "string" && typeof parsed.ct === "string";
  } catch {
    return false;
  }
}
