/**
 * End-to-end encryption — ECDH P-256 + AES-256-GCM (WebCrypto).
 *
 * DMs (v3):    per-message ephemeral ECDH — forward secrecy, sender key discarded after encrypt.
 * Groups (v4): per-message multi-recipient ECIES — random msg key wrapped individually for
 *              each member, no shared state, true per-message forward secrecy.
 *              Legacy group (v2): static shared key — kept for backward-compat decryption only.
 *
 * Private keys are non-extractable and live in IndexedDB (structured clone).
 * The public key is exported as raw bytes (base64) and uploaded to the server.
 */

import { uploadPublicKey, fetchPeerPublicKey, fetchKeyPackage, putKeyPackages } from "@/api/e2ee";
import {
  type E2eeEnvelopeV6,
  type SenderKeyState,
  encryptGroupSK,
  decryptGroupSK,
  generateSenderKey,
  loadOwnSenderKey,
  loadPeerSenderKey,
  saveSenderKeyState,
  buildDistributionBody,
} from "./senderKeys";
export type { E2eeEnvelopeV6 } from "./senderKeys";
import {
  type E2eeEnvelopeV7,
  encryptPQXDH,
  decryptPQXDH,
  getMlKemPublicKeyB64,
} from "./pqxdh";
export type { E2eeEnvelopeV7 } from "./pqxdh";

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

/**
 * v4 — per-message multi-recipient ECIES for groups.
 * A fresh random AES-256-GCM key is generated per message, then ECIES-wrapped
 * individually for every group member. Forward secrecy: message key discarded
 * after encryption; no shared group state required.
 */
export interface E2eeEnvelopeV4 {
  v: 4;
  ciphertext: string;  // base64(iv[12] || AES-GCM ciphertext of plaintext)
  recipients: Array<{
    user_id: string;
    ephemeral_pub: string;  // base64 raw P-256 ephemeral public key (per recipient)
    key_ct: string;         // base64(iv[12] || AES-GCM ciphertext of raw msg key)
  }>;
  senderDeviceId: string;
}

/**
 * v5 — Double Ratchet for DMs (break-in recovery).
 * Each message advances the symmetric ratchet; when the peer sends their next
 * message back, a fresh DH ratchet step runs — future messages self-heal even
 * if the current session private key was actively compromised.
 *
 * Protocol sketch:
 *   Init:     SK = HKDF(ECDH(identity_A, identity_B), info="nexa_dr_init")
 *   DH step:  KDF_RK(RK, ECDH(DHs, DHr)) → (new_RK, new_CK)
 *   Sym step: HMAC-SHA256(CK, 0x01) → new_CK; HMAC-SHA256(CK, 0x02) → MK
 *   Encrypt:  AES-256-GCM(MK, plaintext)
 */
export interface E2eeEnvelopeV5 {
  v: 5;
  dh_pub: string;       // base64 raw P-256 sender ratchet public key
  pn: number;           // previous sending chain length
  n: number;            // message number in current sending chain
  ciphertext: string;   // base64(iv[12] || AES-256-GCM(MK, plaintext))
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
    true, // extractable: required for PKCS#8 key-backup export (#5 multi-device)
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

/** For keyExport.ts: restore an imported key pair into IDB and memory */
export async function restoreDeviceKeyPair(kp: CryptoKeyPair, pubB64: string): Promise<void> {
  await idbSet(IDB_KEY_PAIR, kp);
  await idbSet(IDB_PUBLIC, pubB64);
  _myKeyPair = kp;
  _myPublicB64 = pubB64;
}

/** For keyExport.ts: get the current key pair for PKCS#8 export */
export function getMyKeyPair(): CryptoKeyPair | null {
  return _myKeyPair;
}

// ── Per-conversation AES key cache (in-memory only) ──────────────────────────

const _convKeyCache = new Map<string, CryptoKey>();

// ── Member public key cache (5-min TTL, avoids N API calls per group message) ─

const _pubKeyCache = new Map<string, { b64: string; ts: number }>();
const _PUB_KEY_TTL = 5 * 60 * 1000;

async function _fetchMemberPublicKeys(
  memberIds: string[],
  myUserId: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (_myPublicB64) result.set(myUserId, _myPublicB64);
  await Promise.all(
    memberIds
      .filter(id => id !== myUserId)
      .map(async id => {
        const cached = _pubKeyCache.get(id);
        if (cached && Date.now() - cached.ts < _PUB_KEY_TTL) {
          result.set(id, cached.b64);
          return;
        }
        const key = await fetchPeerPublicKey(id).catch(() => null);
        if (key) {
          _pubKeyCache.set(id, { b64: key, ts: Date.now() });
          result.set(id, key);
        }
      }),
  );
  return result;
}

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

async function _eciesDecryptRaw(
  ephemeralPubB64: string,
  ciphertextB64: string,
): Promise<ArrayBuffer | null> {
  if (!_myKeyPair) return null;
  try {
    const ephKey = await crypto.subtle.importKey(
      "raw", _b64ToBuf(ephemeralPubB64), { name: "ECDH", namedCurve: "P-256" }, false, [],
    );
    const wrapKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: ephKey },
      _myKeyPair.privateKey,
      { name: "AES-GCM", length: 256 }, false, ["decrypt"],
    );
    const combined = _b64ToBuf(ciphertextB64);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, wrapKey, combined.slice(12));
  } catch {
    return null;
  }
}

async function _eciesDecrypt(
  ephemeralPubB64: string,
  ciphertextB64: string,
): Promise<CryptoKey | null> {
  const raw = await _eciesDecryptRaw(ephemeralPubB64, ciphertextB64);
  if (!raw) return null;
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Exported for sender key distribution unwrapping */
export async function eciesDecryptBytes(ephemeralPubB64: string, ciphertextB64: string): Promise<Uint8Array | null> {
  const raw = await _eciesDecryptRaw(ephemeralPubB64, ciphertextB64);
  return raw ? new Uint8Array(raw) : null;
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
  const data = _pad(new TextEncoder().encode(plaintext));
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
    return new TextDecoder().decode(_unpad(new Uint8Array(plain)));
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
  const data = _pad(new TextEncoder().encode(plaintext));
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
    return new TextDecoder().decode(_unpad(new Uint8Array(plain)));
  } catch {
    return "[decryption failed]";
  }
}

// ── Double Ratchet (v5) — DM break-in recovery ───────────────────────────────

interface DRState {
  RK: ArrayBuffer;                    // 32-byte root key
  CKs: ArrayBuffer | null;            // 32-byte send chain key (null until first send)
  CKr: ArrayBuffer | null;            // 32-byte receive chain key (null until first receive)
  DHs_pub: string;                    // base64 own current ratchet public key
  DHs_priv: CryptoKey;                // non-extractable, persisted via IndexedDB structured clone
  DHr: string | null;                 // base64 peer's current ratchet public key
  Ns: number;                         // send message count in current chain
  Nr: number;                         // next expected receive message number
  PN: number;                         // previous send chain length (sent in envelope header)
  MKSKIPPED: Record<string, string>;  // "pubkey:N" → base64(32-byte MK) for out-of-order
}

const _DR_MAX_SKIP = 1000; // cap skipped-key storage per chain

// Raw bytes of ECDH shared secret via deriveKey→exportKey (avoids needing "deriveBits" usage)
async function _ecdhRaw(privKey: CryptoKey, peerPubB64: string): Promise<ArrayBuffer> {
  const peerPub = await crypto.subtle.importKey(
    "raw", _b64ToBuf(peerPubB64), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const derived = await crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPub }, privKey,
    { name: "AES-GCM", length: 256 }, true, ["encrypt"],
  );
  return crypto.subtle.exportKey("raw", derived);
}

// KDF_RK: HKDF(IKM=dhOut, salt=RK, info="nexa_ratchet_root") → [new_RK(32), new_CK(32)]
async function _kdfRk(rk: ArrayBuffer, dhOut: ArrayBuffer): Promise<[ArrayBuffer, ArrayBuffer]> {
  const hkdfKey = await crypto.subtle.importKey("raw", dhOut, "HKDF", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(rk), info: new TextEncoder().encode("nexa_ratchet_root") },
    hkdfKey, 512,
  ));
  return [bits.slice(0, 32).buffer as ArrayBuffer, bits.slice(32).buffer as ArrayBuffer];
}

// KDF_CK: HMAC-SHA256(CK, 0x01) → new_CK; HMAC-SHA256(CK, 0x02) → MK
async function _kdfCk(ck: ArrayBuffer): Promise<[ArrayBuffer, ArrayBuffer]> {
  const hmacKey = await crypto.subtle.importKey(
    "raw", ck, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const newCk = await crypto.subtle.sign("HMAC", hmacKey, new Uint8Array([1]));
  const mk = await crypto.subtle.sign("HMAC", hmacKey, new Uint8Array([2]));
  return [newCk, mk];
}

async function _encryptWithMk(mk: ArrayBuffer, plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", mk, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, _pad(new TextEncoder().encode(plaintext)));
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return _bufToB64(combined.buffer);
}

async function _decryptWithMk(mk: ArrayBuffer, ciphertextB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", mk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const combined = _b64ToBuf(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(_unpad(new Uint8Array(plain)));
}

// Derive initial shared secret from identity ECDH → HKDF
async function _initDRSharedSecret(peerPubB64: string): Promise<ArrayBuffer> {
  if (!_myKeyPair) throw new Error("keypair not initialized");
  const dhOut = await _ecdhRaw(_myKeyPair.privateKey, peerPubB64);
  const hkdfKey = await crypto.subtle.importKey("raw", dhOut, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("nexa_dr_init") },
    hkdfKey, 256,
  );
}

async function _genRatchetKp(): Promise<{ pub: string; priv: CryptoKey }> {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
  return { pub: _bufToB64(pubRaw), priv: kp.privateKey };
}

async function _getOrInitDRState(convId: string, peerUserId: string): Promise<DRState | null> {
  const existing = await idbGet<DRState>(`dr-state:${convId}`);
  if (existing) return existing;
  if (!_myKeyPair || !_myPublicB64) return null;

  const peerPub = await fetchPeerPublicKey(peerUserId).catch(() => null);
  if (!peerPub) return null;

  const sk = await _initDRSharedSecret(peerPub);
  const { pub, priv } = await _genRatchetKp();
  const state: DRState = {
    RK: sk, CKs: null, CKr: null,
    DHs_pub: pub, DHs_priv: priv, DHr: null,
    Ns: 0, Nr: 0, PN: 0, MKSKIPPED: {},
  };
  await idbSet(`dr-state:${convId}`, state);
  return state;
}

/**
 * Encrypt a DM using the Double Ratchet.
 * On first call, initialises the DR session with an identity-key ECDH.
 * Every subsequent call advances the symmetric ratchet; when a reply is received
 * the DH ratchet self-heals the session against break-in.
 */
export async function encryptMessageDR(
  plaintext: string,
  convId: string,
  peerUserId: string,
): Promise<E2eeEnvelopeV5 | null> {
  let state = await _getOrInitDRState(convId, peerUserId);
  if (!state || !_myKeyPair) return null;

  // First send: no CKs yet — do the initial DH ratchet step targeting peer identity pub
  if (!state.CKs) {
    const peerPub = await fetchPeerPublicKey(peerUserId).catch(() => null);
    if (!peerPub) return null;
    const dhTarget = state.DHr ?? peerPub;
    const dhOut = await _ecdhRaw(state.DHs_priv, dhTarget);
    const [newRK, newCKs] = await _kdfRk(state.RK, dhOut);
    state = { ...state, RK: newRK, CKs: newCKs, DHr: dhTarget };
  }

  const [newCKs, mk] = await _kdfCk(state.CKs!);
  const ciphertext = await _encryptWithMk(mk, plaintext);

  const envelope: E2eeEnvelopeV5 = {
    v: 5, dh_pub: state.DHs_pub, pn: state.PN, n: state.Ns,
    ciphertext, senderDeviceId: _getDeviceId(),
  };
  await idbSet(`dr-state:${convId}`, { ...state, CKs: newCKs, Ns: state.Ns + 1 });
  return envelope;
}

/**
 * Decrypt a v5 DM envelope using the Double Ratchet.
 * Performs a DH ratchet step when the sender's ratchet key has changed, which
 * is what provides break-in recovery: after one round-trip the session heals.
 * Out-of-order messages are handled via MKSKIPPED.
 */
export async function decryptMessageDR(
  envelope: E2eeEnvelopeV5,
  convId: string,
  peerUserId: string,
): Promise<string> {
  if (envelope.v !== 5) return "[unsupported envelope version]";
  if (!_myKeyPair) return "[device key not initialized]";

  let state = await idbGet<DRState>(`dr-state:${convId}`);
  if (!state) {
    const peerPub = await fetchPeerPublicKey(peerUserId).catch(() => null);
    if (!peerPub) return "[peer key not found]";
    const sk = await _initDRSharedSecret(peerPub);
    const { pub, priv } = await _genRatchetKp();
    state = {
      RK: sk, CKs: null, CKr: null,
      DHs_pub: pub, DHs_priv: priv, DHr: null,
      Ns: 0, Nr: 0, PN: 0, MKSKIPPED: {},
    };
  }

  // Fast path: out-of-order message whose key was already stored
  const skipKey = `${envelope.dh_pub}:${envelope.n}`;
  if (state.MKSKIPPED[skipKey]) {
    try {
      const plain = await _decryptWithMk(_b64ToBuf(state.MKSKIPPED[skipKey]), envelope.ciphertext);
      const { [skipKey]: _used, ...rest } = state.MKSKIPPED;
      await idbSet(`dr-state:${convId}`, { ...state, MKSKIPPED: rest });
      return plain;
    } catch { return "[decryption failed]"; }
  }

  // DH ratchet step: sender's ratchet key has changed
  if (envelope.dh_pub !== state.DHr) {
    // Save skipped message keys from the current receive chain (pn = their previous chain length)
    if (state.CKr !== null && state.DHr !== null) {
      let ck = state.CKr;
      const limit = Math.min(envelope.pn, state.Nr + _DR_MAX_SKIP);
      for (let i = state.Nr; i < limit; i++) {
        const [nextCk, mk] = await _kdfCk(ck);
        state = { ...state, MKSKIPPED: { ...state.MKSKIPPED, [`${state.DHr}:${i}`]: _bufToB64(mk) } };
        ck = nextCk;
      }
    }

    // For the very first received message use identity key; afterwards use current ratchet key
    const privForRatchet = state.DHr === null ? _myKeyPair.privateKey : state.DHs_priv;
    const dhOut1 = await _ecdhRaw(privForRatchet, envelope.dh_pub);
    const [newRK1, newCKr] = await _kdfRk(state.RK, dhOut1);

    // Immediately generate next DHs and derive new send chain
    const { pub: newDHsPub, priv: newDHsPriv } = await _genRatchetKp();
    const dhOut2 = await _ecdhRaw(newDHsPriv, envelope.dh_pub);
    const [newRK2, newCKs] = await _kdfRk(newRK1, dhOut2);

    state = {
      ...state,
      RK: newRK2, CKs: newCKs, CKr: newCKr,
      DHs_pub: newDHsPub, DHs_priv: newDHsPriv, DHr: envelope.dh_pub,
      PN: state.Ns, Ns: 0, Nr: 0,
    };
  }

  if (!state.CKr) return "[no receive chain]";

  // n before current Nr means the key is gone (wasn't stored in MKSKIPPED)
  if (envelope.n < state.Nr) return "[out-of-order: message key expired]";

  // Skip ahead for in-order gap (stores keys for messages we haven't seen yet)
  let ck = state.CKr;
  const skipLimit = Math.min(envelope.n, state.Nr + _DR_MAX_SKIP);
  for (let i = state.Nr; i < skipLimit; i++) {
    const [nextCk, mk] = await _kdfCk(ck);
    state = { ...state, MKSKIPPED: { ...state.MKSKIPPED, [`${envelope.dh_pub}:${i}`]: _bufToB64(mk) } };
    ck = nextCk;
  }

  const [newCKr, mk] = await _kdfCk(ck);
  try {
    const plain = await _decryptWithMk(mk, envelope.ciphertext);
    await idbSet(`dr-state:${convId}`, { ...state, CKr: newCKr, Nr: envelope.n + 1 });
    return plain;
  } catch { return "[decryption failed]"; }
}

// ── Group per-message ECIES (v4) ─────────────────────────────────────────────

/**
 * Encrypt `plaintext` for a group using a fresh per-message AES-256-GCM key,
 * individually ECIES-wrapped for every member.
 * memberPubKeys: Map<userId, base64PublicKey>
 */
export async function encryptMessageGroupV4(
  plaintext: string,
  memberPubKeys: Map<string, string>,
): Promise<E2eeEnvelopeV4> {
  // Fresh random message key — discarded after this function returns.
  const msgKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawMsgKey = await crypto.subtle.exportKey("raw", msgKey);

  // Encrypt plaintext with the message key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, msgKey, _pad(new TextEncoder().encode(plaintext)));
  const body = new Uint8Array(12 + ct.byteLength);
  body.set(iv);
  body.set(new Uint8Array(ct), 12);

  // Wrap the message key for each recipient in parallel.
  const recipients = await Promise.all(
    Array.from(memberPubKeys.entries()).map(async ([userId, pubB64]) => {
      const wrapped = await _eciesEncrypt(pubB64, rawMsgKey);
      return { user_id: userId, ephemeral_pub: wrapped.ephemeral_pub, key_ct: wrapped.ciphertext };
    }),
  );

  return { v: 4, ciphertext: _bufToB64(body.buffer), recipients, senderDeviceId: _getDeviceId() };
}

/**
 * Decrypt a v4 group envelope. Finds the caller's recipient entry and uses
 * ECIES to recover the per-message key.
 */
export async function decryptMessageGroupV4(
  envelope: E2eeEnvelopeV4,
  myUserId: string,
): Promise<string> {
  if (envelope.v !== 4) return "[unsupported envelope version]";
  if (!_myKeyPair) return "[device key not initialized]";
  const mine = envelope.recipients.find(r => r.user_id === myUserId);
  if (!mine) return "[not in recipient list]";
  try {
    const rawKey = await _eciesDecryptRaw(mine.ephemeral_pub, mine.key_ct);
    if (!rawKey) return "[key decryption failed]";
    const aesKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const combined = _b64ToBuf(envelope.ciphertext);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, aesKey, combined.slice(12));
    return new TextDecoder().decode(_unpad(new Uint8Array(plain)));
  } catch {
    return "[decryption failed]";
  }
}

/**
 * Decrypt a v6 Sender Keys group envelope.
 * Returns { plaintext, senderId } — sender_id comes from inside the sealed payload,
 * not from server metadata (sealed sender: server cannot determine who sent).
 */
export async function decryptGroupV6(
  envelope: E2eeEnvelopeV6,
  groupId: string,
  senderUserId: string,
): Promise<{ plaintext: string; senderId: string }> {
  const peerState = await loadPeerSenderKey(groupId, senderUserId);
  if (!peerState) return { plaintext: "[no sender key — request redistribution]", senderId: senderUserId };
  try {
    const { plaintext, senderId, nextState } = await decryptGroupSK(envelope, peerState);
    await saveSenderKeyState(groupId, senderUserId, nextState, nextState.skId);
    return { plaintext, senderId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("SK_ID_MISMATCH")) {
      return { plaintext: "[sender key rotated — fetch new distribution]", senderId: senderUserId };
    }
    return { plaintext: "[v6 decryption failed]", senderId: senderUserId };
  }
}

/**
 * Initialize or rotate our Sender Key for a group, distribute to all members.
 * Call on group creation, on joining, or when a member is removed.
 */
export async function initGroupSenderKey(
  groupId: string,
  myUserId: string,
  memberPubKeys: Map<string, string>,
): Promise<void> {
  const state = await generateSenderKey(groupId, myUserId);
  const body = buildDistributionBody(state);
  const distributions = await Promise.all(
    Array.from(memberPubKeys.entries()).map(async ([userId, pubB64]) => {
      const encoded = new TextEncoder().encode(JSON.stringify(body));
      const plainBuf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
      const wrapped = await _eciesEncrypt(pubB64, plainBuf);
      return { userId, ephemeral_pub: wrapped.ephemeral_pub, key_ct: wrapped.ciphertext };
    }),
  );
  // Import the distribution API inline to avoid circular deps at module load time
  const { uploadSenderKeyDistribution } = await import("@/api/e2ee");
  await uploadSenderKeyDistribution(groupId, distributions);
}

/**
 * Decrypt a v7 PQXDH envelope (DMs — post-quantum hybrid).
 */
export async function decryptMessagePQXDH(envelope: E2eeEnvelopeV7): Promise<string> {
  if (!_myKeyPair) return "[device key not initialized]";
  try {
    return await decryptPQXDH(envelope, _myKeyPair.privateKey);
  } catch {
    return "[v7 PQXDH decryption failed]";
  }
}

/**
 * Unified encrypt helper:
 *   DM    → v7 (PQXDH hybrid ML-KEM-768 + ECDH: post-quantum forward secrecy)
 *           Falls back to v5 (Double Ratchet) if peer has no ML-KEM key yet.
 *   Group → v6 (Sender Keys: forward secrecy + break-in recovery + sealed sender)
 *           Falls back to v4 if sender key not yet initialized.
 */
export async function encryptForConversation(
  plaintext: string,
  conversationId: string,
  peerOrMembers: string | string[],
  isGroup: boolean,
  myUserId: string,
): Promise<E2eeEnvelope | E2eeEnvelopeV3 | E2eeEnvelopeV4 | E2eeEnvelopeV5 | E2eeEnvelopeV6 | E2eeEnvelopeV7 | null> {
  if (!isGroup) {
    const peerId = peerOrMembers as string;
    if (!peerId) return null;

    // Try v7 PQXDH first (if peer has ML-KEM key)
    try {
      const { fetchPeerMlKemPublicKey } = await import("@/api/e2ee");
      const peerMlKemPub = await fetchPeerMlKemPublicKey(peerId);
      if (peerMlKemPub && _myPublicB64) {
        const peerEcdhPub = await fetchPeerPublicKey(peerId);
        if (peerEcdhPub) {
          return encryptPQXDH(plaintext, peerEcdhPub, peerMlKemPub, _myPublicB64);
        }
      }
    } catch {
      // Fall through to v5
    }

    return encryptMessageDR(plaintext, conversationId, peerId);
  }

  const memberIds = peerOrMembers as string[];

  // Try v6 Sender Keys first
  let skState = await loadOwnSenderKey(conversationId);
  if (!skState) {
    // First message in this group: initialize sender key
    const memberPubKeys = await _fetchMemberPublicKeys(memberIds, myUserId);
    if (memberPubKeys.size > 0) {
      await initGroupSenderKey(conversationId, myUserId, memberPubKeys);
      skState = await loadOwnSenderKey(conversationId);
    }
  }
  if (skState) {
    const { envelope, nextState } = await encryptGroupSK(plaintext, myUserId, skState);
    await saveSenderKeyState(conversationId, myUserId, nextState, nextState.skId);
    return envelope;
  }

  // Fallback to v4 if sender key setup failed
  const memberPubKeys = await _fetchMemberPublicKeys(memberIds, myUserId);
  if (memberPubKeys.size === 0) return null;
  return encryptMessageGroupV4(plaintext, memberPubKeys);
}

// ── Message padding (ISO 7816-4) ─────────────────────────────────────────────
// All user message plaintext is padded to the nearest 256-byte block before
// AES-GCM encryption. This hides the exact plaintext length from the server —
// every message under 256 bytes produces identical-length ciphertext (274 bytes
// after IV + AES-GCM tag). Backward-compatible: _unpad returns input unchanged
// when no 0x80 marker is found (pre-padding messages still decrypt correctly).

const _PAD_BLOCK = 256;

function _pad(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const padLen = _PAD_BLOCK - (data.length % _PAD_BLOCK);
  const buf = new ArrayBuffer(data.length + padLen);
  const out = new Uint8Array(buf);
  out.set(data);
  out[data.length] = 0x80; // ISO 7816-4 marker; remainder stays 0x00
  return out;
}

function _unpad(data: Uint8Array): Uint8Array {
  let i = data.length - 1;
  while (i >= 0 && data[i] === 0x00) i--;
  if (i >= 0 && data[i] === 0x80) return data.slice(0, i);
  return data; // no padding found → backward-compat with old messages
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
