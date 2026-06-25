/**
 * Multi-device E2EE key export/import (#5).
 *
 * Allows migrating the device's ECDH key pair to a new browser/device
 * so the user can continue receiving encrypted messages without losing history.
 *
 * Security properties:
 *   - Private key exported via PKCS#8, then AES-256-GCM encrypted
 *   - Encryption key derived from passphrase via PBKDF2 (SHA-256, 600000 iter)
 *   - Random 16-byte salt + 12-byte IV per export
 *   - Output is a self-contained JSON blob (.nexa-keys file)
 *
 * Limitation: Double Ratchet session state for DMs is NOT exported — imported
 * device will start fresh DM sessions. Past DM ciphertexts require the original
 * device's ratchet state. Group sender keys (v6) are redistributed automatically
 * on next message from each group member.
 */

import { getMyKeyPair, getMyPublicKeyB64, restoreDeviceKeyPair } from "./e2ee";

const enc = new TextEncoder();

interface KeyBackup {
  version: 1;
  salt: string;       // base64, 16 bytes
  iv: string;         // base64, 12 bytes
  ciphertext: string; // base64, PKCS#8 encrypted with AES-256-GCM
  publicKey: string;  // base64 raw P-256 public key (for verification)
}

function _b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function _fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function _deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const passBytes = enc.encode(passphrase);
  const passBuf = new Uint8Array(passBytes.buffer as ArrayBuffer) as Uint8Array<ArrayBuffer>;
  const baseKey = await crypto.subtle.importKey("raw", passBuf, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Export the current device's ECDH private key, encrypted with a passphrase.
 * Returns a JSON string to save as a .nexa-keys file.
 */
export async function exportDeviceKeys(passphrase: string): Promise<string> {
  const kp = getMyKeyPair();
  const pubB64 = getMyPublicKeyB64();
  if (!kp || !pubB64) throw new Error("Device key pair not initialized — open the app first");

  const pkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const wrapKey = await _deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, pkcs8);

  const backup: KeyBackup = {
    version: 1,
    salt: _b64(salt),
    iv: _b64(iv),
    ciphertext: _b64(ciphertext),
    publicKey: pubB64,
  };
  return JSON.stringify(backup);
}

/**
 * Import device keys from a previously exported backup.
 * Restores the ECDH key pair in IndexedDB, replacing current device keys.
 *
 * Throws "WRONG_PASSPHRASE" if the passphrase is incorrect.
 */
export async function importDeviceKeys(backupJson: string, passphrase: string): Promise<void> {
  let backup: KeyBackup;
  try {
    backup = JSON.parse(backupJson) as KeyBackup;
  } catch {
    throw new Error("INVALID_BACKUP: not valid JSON");
  }
  if (backup.version !== 1) throw new Error("INVALID_BACKUP: unsupported version");

  const salt = _fromB64(backup.salt);
  const iv = _fromB64(backup.iv);
  const ciphertext = _fromB64(backup.ciphertext);

  const wrapKey = await _deriveKey(passphrase, salt);
  let pkcs8: ArrayBuffer;
  try {
    pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrapKey, ciphertext);
  } catch {
    throw new Error("WRONG_PASSPHRASE");
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pkcs8,
    { name: "ECDH", namedCurve: "P-256" },
    true, // must match the exportability we set at generation time
    ["deriveKey"],
  );
  const publicKey = await crypto.subtle.importKey(
    "raw", _fromB64(backup.publicKey),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  await restoreDeviceKeyPair({ privateKey, publicKey }, backup.publicKey);
}
