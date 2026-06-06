/**
 * End-to-end encryption (client-side) using AES-256-GCM via WebCrypto.
 *
 * Key agreement: ECDH P-256. Each conversation uses a derived AES-256-GCM key
 * stored in sessionStorage so it survives page refresh but not tab close.
 * For multi-device / persistent E2EE, replace key storage with a proper
 * key-server or libsignal/MLS ratchet.
 */

export interface E2eeEnvelope {
  v: 2;
  ciphertext: string; // base64url(iv || ciphertext_bytes)
  senderDeviceId: string;
}

export interface ConversationKeys {
  conversationId: string;
  aesKey: CryptoKey;
}

const SESSION_KEY_PREFIX = "e2ee_key_";

// ── Key generation ────────────────────────────────────────────────────────────

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
}

export async function exportPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return _bufToB64(raw);
}

export async function deriveConversationKey(
  myKeyPair: CryptoKeyPair,
  peerPublicKeyB64: string,
): Promise<CryptoKey> {
  const peerRaw = _b64ToBuf(peerPublicKeyB64);
  const peerKey = await crypto.subtle.importKey(
    "raw",
    peerRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: peerKey },
    myKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Per-conversation key management ──────────────────────────────────────────

export async function getOrCreateConversationKey(conversationId: string): Promise<ConversationKeys> {
  const stored = sessionStorage.getItem(SESSION_KEY_PREFIX + conversationId);
  if (stored) {
    const raw = _b64ToBuf(stored);
    const aesKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return { conversationId, aesKey };
  }
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const exported = await crypto.subtle.exportKey("raw", aesKey);
  sessionStorage.setItem(SESSION_KEY_PREFIX + conversationId, _bufToB64(exported));
  return { conversationId, aesKey };
}

export function clearConversationKey(conversationId: string): void {
  sessionStorage.removeItem(SESSION_KEY_PREFIX + conversationId);
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────────

export async function encryptMessageEnvelope(
  plaintext: string,
  keys: ConversationKeys,
): Promise<E2eeEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keys.aesKey, data);
  // Pack as iv (12 bytes) || ciphertext
  const combined = new Uint8Array(iv.byteLength + ciphertextBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuf), iv.byteLength);
  return {
    v: 2,
    ciphertext: _bufToB64(combined.buffer),
    senderDeviceId: _getDeviceId(),
  };
}

export async function decryptMessageEnvelope(
  envelope: E2eeEnvelope,
  keys: ConversationKeys,
): Promise<string> {
  if (envelope.v !== 2) return "[unsupported envelope version]";
  const combined = _b64ToBuf(envelope.ciphertext);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keys.aesKey, ciphertext);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return "[decryption failed]";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function _b64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function _getDeviceId(): string {
  let id = sessionStorage.getItem("e2ee_device_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("e2ee_device_id", id);
  }
  return id;
}
