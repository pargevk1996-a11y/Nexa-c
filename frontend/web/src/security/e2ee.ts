/**
 * End-to-end encryption — ECDH P-256 + AES-256-GCM (WebCrypto).
 *
 * DM conversations:  shared key = ECDH(my_private, peer_public)
 * Group/channel:     shared key = random AES key wrapped per-member via ECIES,
 *                    stored server-side as opaque ciphertext.
 *
 * Private keys are non-extractable and live in IndexedDB (structured clone).
 * The public key is exported as raw bytes (base64url) and uploaded to the
 * server so peers can perform key agreement.
 */

import { uploadPublicKey, fetchPeerPublicKey, fetchKeyPackage, putKeyPackages } from "@/api/e2ee";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface E2eeEnvelope {
  v: 2;
  ciphertext: string;       // base64(iv[12] || ciphertext)
  senderDeviceId: string;
}

/**
 * v3 — per-message ephemeral ECDH for DMs.
 * Forward secrecy: sender discards ephemeral private key immediately.
 * Recipient decrypts via ECDH(own_private, ephemeral_pub).
 */
export interface E2eeEnvelopeV3 {
  v: 3;
  ephemeral_pub: string;    // base64 raw P-256 ephemeral sender public key
  ciphertext: string;       // base64(iv[12] || ciphertext)
  senderDeviceId: string;
}

// ── IndexedDB key storage ─────────────────────────────────────────────────────

const IDB_NAME = "nexa-e2ee";
const IDB_STORE = "keys";
const IDB_KEY_PAIR = "ecdh-keypair-v1";
const IDB_PUBLIC = "ecdh-public-b64-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Device key pair (per browser origin, persisted in IndexedDB) ─────────────

let _myKeyPair: CryptoKeyPair | null = null;
let _myPublicB64: string | null = null;

export async function initDeviceKeyPair(): Promise<string> {
  // Return cached if already loaded this session.
  if (_myKeyPair && _myPublicB64) return _myPublicB64;

  // Try to load from IndexedDB.
  const stored = await idbGet<CryptoKeyPair>(IDB_KEY_PAIR);
  const storedPub = await idbGet<string>(IDB_PUBLIC);

  if (stored && storedPub) {
    _myKeyPair = stored;
    _myPublicB64 = storedPub;
    return storedPub;
  }

  // Generate fresh pair.
  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // private key: non-extractable (safe in IndexedDB structured clone)
    ["deriveKey"],
  );
  const rawPub = await crypto.subtle.exportKey("raw", kp.publicKey);
  const pub64 = _bufToB64(rawPub);

  await idbSet(IDB_KEY_PAIR, kp);
  await idbSet(IDB_PUBLIC, pub64);

  _myKeyPair = kp;
  _myPublicB64 = pub64;

  // Upload to server so peers can start key agreement.
  await uploadPublicKey(pub64).catch(() => {});

  return pub64;
}

export function getMyPublicKeyB64(): string | null {
  return _myPublicB64;
}

// ── Per-conversation AES key cache (in-memory only) ──────────────────────────

const _convKeyCache = new Map<string, CryptoKey>();

/**
 * Get (or derive/decrypt) the AES-256-GCM key for a conversation.
 *
 * @param conversationId  The conversation ID.
 * @param peerUserIdOrMemberIds  For DMs: the peer's user ID.
 *                               For groups: array of all member user IDs.
 * @param isGroup  true for group/channel, false for DM.
 */
export async function getConversationKey(
  conversationId: string,
  peerUserIdOrMemberIds: string | string[],
  isGroup: boolean,
  myUserId: string,
): Promise<CryptoKey | null> {
  const cached = _convKeyCache.get(conversationId);
  if (cached) return cached;

  if (!_myKeyPair) return null;

  if (!isGroup) {
    // ── DM: ECDH key agreement ──────────────────────────────────────────
    const peerId = peerUserIdOrMemberIds as string;
    const peerPub64 = await fetchPeerPublicKey(peerId);
    if (!peerPub64) return null;

    const peerRaw = _b64ToBuf(peerPub64);
    const peerKey = await crypto.subtle.importKey(
      "raw",
      peerRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: peerKey },
      _myKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    _convKeyCache.set(conversationId, aesKey);
    return aesKey;
  }

  // ── Group: try to fetch existing key package from server ─────────────
  const existing = await fetchKeyPackage(conversationId);
  if (existing) {
    const aesKey = await _eciesDecrypt(existing.ephemeral_pub, existing.ciphertext);
    if (aesKey) {
      _convKeyCache.set(conversationId, aesKey);
      return aesKey;
    }
  }

  // No package yet — I'm the first sender. Generate group key and distribute.
  const memberIds = peerUserIdOrMemberIds as string[];
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // must be exportable to wrap for each member
    ["encrypt", "decrypt"],
  );
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);

  // Wrap the AES key for each member via ECIES and push to server.
  const packages: { user_id: string; package: { ephemeral_pub: string; ciphertext: string } }[] = [];
  const allIds = Array.from(new Set([myUserId, ...memberIds]));
  for (const uid of allIds) {
    let pubB64: string | null;
    if (uid === myUserId) {
      pubB64 = _myPublicB64;
    } else {
      pubB64 = await fetchPeerPublicKey(uid);
    }
    if (!pubB64) continue;
    const wrapped = await _eciesEncrypt(pubB64, rawAes);
    packages.push({ user_id: uid, package: wrapped });
  }
  if (packages.length > 0) {
    await putKeyPackages(conversationId, packages).catch(() => {});
  }

  // Make the key non-extractable for the cache.
  const safeKey = await crypto.subtle.importKey(
    "raw",
    rawAes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  _convKeyCache.set(conversationId, safeKey);
  return safeKey;
}

export function clearConversationKey(conversationId: string): void {
  _convKeyCache.delete(conversationId);
}

// ── ECIES helpers (encrypt/decrypt an AES key for a recipient) ───────────────

async function _eciesEncrypt(
  recipientPubB64: string,
  plainBytes: ArrayBuffer,
): Promise<{ ephemeral_pub: string; ciphertext: string }> {
  // Ephemeral ECDH key pair.
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const ephPubRaw = await crypto.subtle.exportKey("raw", ephemeral.publicKey);

  // Import recipient public key.
  const recipRaw = _b64ToBuf(recipientPubB64);
  const recipKey = await crypto.subtle.importKey(
    "raw",
    recipRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // Derive wrapping key.
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipKey },
    ephemeral.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, plainBytes);
  const combined = new Uint8Array(iv.byteLength + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.byteLength);
  return {
    ephemeral_pub: _bufToB64(ephPubRaw),
    ciphertext: _bufToB64(combined.buffer),
  };
}

async function _eciesDecrypt(
  ephemeralPubB64: string,
  ciphertextB64: string,
): Promise<CryptoKey | null> {
  if (!_myKeyPair) return null;
  try {
    const ephRaw = _b64ToBuf(ephemeralPubB64);
    const ephKey = await crypto.subtle.importKey(
      "raw",
      ephRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const wrapKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: ephKey },
      _myKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const combined = _b64ToBuf(ciphertextB64);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const rawAes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrapKey, ct);
    return crypto.subtle.importKey(
      "raw",
      rawAes,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

// ── Message encrypt / decrypt ─────────────────────────────────────────────────

let _deviceId: string | null = null;
function _getDeviceId(): string {
  if (_deviceId) return _deviceId;
  _deviceId = sessionStorage.getItem("e2ee_device_id") ?? crypto.randomUUID();
  sessionStorage.setItem("e2ee_device_id", _deviceId);
  return _deviceId;
}

export async function encryptMessage(plaintext: string, key: CryptoKey): Promise<E2eeEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(iv.byteLength + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.byteLength);
  return { v: 2, ciphertext: _bufToB64(combined.buffer), senderDeviceId: _getDeviceId() };
}

export async function decryptMessage(envelope: E2eeEnvelope, key: CryptoKey): Promise<string> {
  if (envelope.v !== 2) return "[unsupported envelope version]";
  try {
    const combined = _b64ToBuf(envelope.ciphertext);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(plain);
  } catch {
    return "[decryption failed]";
  }
}

// ── Forward-secret DM encryption (v3) ─────────────────────────────────────────

/**
 * Encrypt `plaintext` for a specific DM recipient using a fresh ephemeral key.
 * The ephemeral private key is discarded immediately after encryption, giving
 * forward secrecy: future compromise of the recipient's long-term key cannot
 * decrypt past messages.
 *
 * NOTE: The SENDER cannot decrypt their own sent messages after a page reload
 * (the ephemeral key is gone). Outgoing messages show plaintext in the current
 * session via the optimistic state; after reload they show a locked placeholder.
 */
export async function encryptMessageForward(
  plaintext: string,
  recipientPubB64: string,
): Promise<E2eeEnvelopeV3> {
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,       // must be extractable to export the public key into the envelope
    ["deriveKey"],
  );
  const ephPubRaw = await crypto.subtle.exportKey("raw", ephemeral.publicKey);

  const recipRaw = _b64ToBuf(recipientPubB64);
  const recipKey = await crypto.subtle.importKey(
    "raw",
    recipRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipKey },
    ephemeral.privateKey,   // ephemeral private key — discarded when this function returns
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, data);
  const combined = new Uint8Array(iv.byteLength + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.byteLength);

  return {
    v: 3,
    ephemeral_pub: _bufToB64(ephPubRaw),
    ciphertext: _bufToB64(combined.buffer),
    senderDeviceId: _getDeviceId(),
  };
}

/**
 * Decrypt a v3 envelope using the receiver's own long-term private key.
 * The sender's ephemeral public key is in the envelope.
 */
export async function decryptMessageForward(envelope: E2eeEnvelopeV3): Promise<string> {
  if (envelope.v !== 3) return "[unsupported envelope version]";
  if (!_myKeyPair) return "[device key not initialized]";
  try {
    const ephRaw = _b64ToBuf(envelope.ephemeral_pub);
    const ephKey = await crypto.subtle.importKey(
      "raw",
      ephRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: ephKey },
      _myKeyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const combined = _b64ToBuf(envelope.ciphertext);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
    return new TextDecoder().decode(plain);
  } catch {
    return "[decryption failed]";
  }
}

/**
 * Unified encrypt helper: uses per-message ephemeral ECDH (v3) for DMs,
 * static group key (v2) for group conversations.
 */
export async function encryptForConversation(
  plaintext: string,
  conversationId: string,
  peerOrMembers: string | string[],
  isGroup: boolean,
  myUserId: string,
): Promise<E2eeEnvelope | E2eeEnvelopeV3 | null> {
  if (!isGroup) {
    const peerId = peerOrMembers as string;
    if (!peerId) return null;
    const peerPub64 = await fetchPeerPublicKey(peerId);
    if (!peerPub64) return null;
    return encryptMessageForward(plaintext, peerPub64);
  }
  // Group: use static group AES key
  const key = await getConversationKey(conversationId, peerOrMembers, true, myUserId);
  if (!key) return null;
  return encryptMessage(plaintext, key);
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
