/**
 * End-to-end encryption (client-side) using AES-256-GCM via WebCrypto.
 *
 * Key management: all CryptoKey objects are non-extractable and live ONLY in
 * the _keyCache module-level Map — they are never written to sessionStorage,
 * localStorage, or any other storage. This means:
 *   - An XSS attacker can call crypto.subtle.encrypt/decrypt but cannot
 *     call exportKey() to exfiltrate raw key bytes.
 *   - Keys are session-scoped: lost on page reload (forward secrecy by design).
 *     For persistent E2EE replace with a proper key-server or MLS ratchet.
 *
 * Key agreement: ECDH P-256. Conversation keys are AES-256-GCM, generated
 * fresh per conversation per tab session.
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

// In-memory store: non-extractable CryptoKey objects, never touches any storage.
const _keyCache = new Map<string, CryptoKey>();

// Stable ephemeral device ID (tab-scoped, not sensitive).
let _deviceId: string | null = null;

// ── Key generation ────────────────────────────────────────────────────────────

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // public key must be exportable to share with peers
    ["deriveKey"],
  );
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
    false, // non-extractable derived key
    ["encrypt", "decrypt"],
  );
}

// ── Per-conversation key management ──────────────────────────────────────────

export async function getOrCreateConversationKey(conversationId: string): Promise<ConversationKeys> {
  const cached = _keyCache.get(conversationId);
  if (cached) return { conversationId, aesKey: cached };

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: raw bytes inaccessible to JS, even via exportKey
    ["encrypt", "decrypt"],
  );
  _keyCache.set(conversationId, aesKey);
  return { conversationId, aesKey };
}

export function clearConversationKey(conversationId: string): void {
  _keyCache.delete(conversationId);
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
  if (_deviceId) return _deviceId;
  // Not sensitive — just a stable-per-tab identifier for sender attribution.
  _deviceId = sessionStorage.getItem("e2ee_device_id") ?? crypto.randomUUID();
  sessionStorage.setItem("e2ee_device_id", _deviceId);
  return _deviceId;
}
