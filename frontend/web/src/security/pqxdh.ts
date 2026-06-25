/**
 * PQXDH — Post-Quantum Extended Diffie-Hellman (v7 envelope).
 *
 * Hybrid key agreement combining classical ECDH P-256 with ML-KEM-768
 * (CRYSTALS-Kyber). Security holds if EITHER primitive is secure:
 *   - ML-KEM-768 resists quantum computers (Grover / Shor)
 *   - ECDH P-256 provides current classical security
 *
 * Protocol (per-message, like v3 but with PQ component):
 *   1. Sender generates ephemeral ECDH P-256 key pair
 *   2. Sender encapsulates peer's ML-KEM-768 public key → (mlkem_ct, mlkem_shared)
 *   3. Hybrid key: HKDF-SHA256(ECDH_shared || mlkem_shared, info="nexa_pqxdh_v7") → 32 bytes
 *   4. Encrypt: AES-256-GCM(hybrid_key, padded_plaintext)
 *   5. Envelope: { v:7, ephemeral_pub, mlkem_ct, ciphertext }
 *
 * Recipient mirrors steps 1–3 in reverse (ECDH with stored private, decapsulate mlkem_ct).
 *
 * Implementation note: ML-KEM is not in WebCrypto — uses @noble/post-quantum (pure JS,
 * constant-time). Secret key stored as raw bytes in IDB (same as other post-quantum
 * browser implementations; non-extractable CryptoKey is impossible for non-WebCrypto algorithms).
 */

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface E2eeEnvelopeV7 {
  v: 7;
  /** base64 raw P-256 ephemeral public key (65 bytes uncompressed) */
  ephemeral_pub: string;
  /** base64 ML-KEM-768 ciphertext (1088 bytes) */
  mlkem_ct: string;
  /** base64(iv[12] || AES-256-GCM ciphertext of padded plaintext) */
  ciphertext: string;
  senderDeviceId: string;
}

// ── IDB storage for ML-KEM key pair ──────────────────────────────────────────

const IDB_NAME = "nexa-pqxdh";
const IDB_STORE = "keys";
const IDB_SK = "mlkem768-secret-key";
const IDB_PK = "mlkem768-public-key-b64";

function _openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function _idbGet<T>(key: string): Promise<T | undefined> {
  const db = await _openDb();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => res(req.result as T | undefined);
    req.onerror = () => rej(req.error);
  });
}

async function _idbSet(key: string, value: unknown): Promise<void> {
  const db = await _openDb();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

// ── Cached key pair (in-memory this session) ─────────────────────────────────

let _mlKemSecretKey: Uint8Array | null = null;
let _mlKemPublicB64: string | null = null;

// ── Key pair lifecycle ────────────────────────────────────────────────────────

function _toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function _fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Initialize (or load) the ML-KEM-768 key pair.
 * Returns the base64 public key (1184 bytes).
 */
export async function initMlKemKeyPair(): Promise<string> {
  if (_mlKemSecretKey && _mlKemPublicB64) return _mlKemPublicB64;

  const storedSk = await _idbGet<Uint8Array>(IDB_SK);
  const storedPk = await _idbGet<string>(IDB_PK);

  if (storedSk && storedPk) {
    _mlKemSecretKey = new Uint8Array(storedSk); // re-hydrate from IDB structured clone
    _mlKemPublicB64 = storedPk;
    return storedPk;
  }

  // Generate fresh key pair
  const { secretKey, publicKey } = ml_kem768.keygen();
  const pkB64 = _toB64(publicKey);

  await _idbSet(IDB_SK, secretKey);
  await _idbSet(IDB_PK, pkB64);

  _mlKemSecretKey = secretKey;
  _mlKemPublicB64 = pkB64;

  return pkB64;
}

export function getMlKemPublicKeyB64(): string | null {
  return _mlKemPublicB64;
}

// ── Helpers shared with e2ee.ts (ECDH raw bytes + HKDF) ─────────────────────

async function _ecdhRawBytes(
  ephemeralPrivKey: CryptoKey,
  peerPubB64: string,
): Promise<ArrayBuffer> {
  const raw = _fromB64(peerPubB64);
  const peerPub = await crypto.subtle.importKey(
    "raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const derived = await crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPub },
    ephemeralPrivKey,
    { name: "AES-GCM", length: 256 }, true, ["encrypt"],
  );
  return crypto.subtle.exportKey("raw", derived);
}

async function _hkdf32(
  ikm1: ArrayBuffer,
  ikm2: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  // IKM = ECDH_shared || ML-KEM_shared
  const combined = new Uint8Array(ikm1.byteLength + ikm2.length);
  combined.set(new Uint8Array(ikm1), 0);
  combined.set(ikm2, ikm1.byteLength);

  const base = await crypto.subtle.importKey("raw", combined, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
      info: new TextEncoder().encode("nexa_pqxdh_v7") as Uint8Array<ArrayBuffer>,
    },
    base,
    256,
  );
  return new Uint8Array(bits) as Uint8Array<ArrayBuffer>;
}

const PAD_BLOCK = 256;

function _pad(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const padLen = PAD_BLOCK - (data.length % PAD_BLOCK);
  const out = new Uint8Array(data.length + padLen) as Uint8Array<ArrayBuffer>;
  out.set(data);
  out[data.length] = 0x80;
  return out;
}

function _unpad(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  let i = data.length - 1;
  while (i >= 0 && data[i] === 0x00) i--;
  if (i >= 0 && data[i] === 0x80) return data.slice(0, i) as Uint8Array<ArrayBuffer>;
  return data;
}

// ── PQXDH Encrypt (sender) ────────────────────────────────────────────────────

/**
 * Encrypt a DM message using PQXDH (v7).
 * Requires both the peer's ECDH public key and ML-KEM-768 public key.
 */
export async function encryptPQXDH(
  plaintext: string,
  peerEcdhPubB64: string,
  peerMlKemPubB64: string,
  senderDeviceId: string,
): Promise<E2eeEnvelopeV7> {
  // 1. Ephemeral ECDH key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"],
  );
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  // 2. ECDH shared secret
  const ecdhShared = await _ecdhRawBytes(ephemeral.privateKey, peerEcdhPubB64);

  // 3. ML-KEM-768 encapsulate
  const peerMlKemPub = _fromB64(peerMlKemPubB64);
  const { cipherText: mlKemCt, sharedSecret: mlKemShared } = ml_kem768.encapsulate(peerMlKemPub);

  // 4. Hybrid key derivation
  const hybridKey32 = await _hkdf32(ecdhShared, mlKemShared);
  const aesKey = await crypto.subtle.importKey(
    "raw", hybridKey32, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );

  // 5. Encrypt with padding
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const encoded = new TextEncoder().encode(plaintext);
  const padded = _pad(new Uint8Array(encoded.buffer as ArrayBuffer) as Uint8Array<ArrayBuffer>);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, padded);

  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);

  return {
    v: 7,
    ephemeral_pub: _toB64(ephPubRaw),
    mlkem_ct: _toB64(mlKemCt),
    ciphertext: _toB64(combined),
    senderDeviceId,
  };
}

// ── PQXDH Decrypt (recipient) ─────────────────────────────────────────────────

/**
 * Decrypt a v7 PQXDH envelope.
 * Uses the local ECDH private key (from e2ee.ts) + ML-KEM secret key from IDB.
 */
export async function decryptPQXDH(
  envelope: E2eeEnvelopeV7,
  myEcdhPrivateKey: CryptoKey,
): Promise<string> {
  if (!_mlKemSecretKey) {
    await initMlKemKeyPair();
    if (!_mlKemSecretKey) throw new Error("ML-KEM key not available");
  }

  // 1. ECDH shared secret
  const ecdhShared = await _ecdhRawBytes(myEcdhPrivateKey, envelope.ephemeral_pub);

  // 2. ML-KEM decapsulate
  const mlKemCt = _fromB64(envelope.mlkem_ct);
  const mlKemShared = ml_kem768.decapsulate(mlKemCt, _mlKemSecretKey);

  // 3. Hybrid key derivation
  const hybridKey32 = await _hkdf32(ecdhShared, mlKemShared);
  const aesKey = await crypto.subtle.importKey(
    "raw", hybridKey32, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );

  // 4. Decrypt
  const combined = _fromB64(envelope.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) as Uint8Array<ArrayBuffer> },
    aesKey,
    combined.slice(12) as Uint8Array<ArrayBuffer>,
  );
  return new TextDecoder().decode(_unpad(new Uint8Array(plain) as Uint8Array<ArrayBuffer>));
}
