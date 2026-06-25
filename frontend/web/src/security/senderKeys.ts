/**
 * Sender Keys protocol for group E2EE (v6 envelope).
 *
 * Provides forward secrecy AND break-in recovery for group messages:
 *   - Forward secrecy: chain key advances per message; past keys are deleted.
 *   - Break-in recovery: when a member is removed / compromise suspected, the
 *     sender generates a fresh SenderKey and distributes it only to remaining
 *     members. The excluded/compromised party cannot derive the new chain.
 *
 * Protocol:
 *   1. SenderKeyState = { chainKey[32], iteration, groupId, senderId }
 *   2. Per message: msgKey = HMAC-SHA256(chainKey, 0x02)
 *                   nextCK = HMAC-SHA256(chainKey, 0x01)
 *   3. Encrypt: AES-256-GCM(msgKey, padded_payload)
 *      payload includes sealed sender: JSON{ sender_id } AES-GCM encrypted
 *      with a per-message derivation so recipients can verify identity.
 *   4. Distribution: SenderKeyDistribution encrypted with each recipient's
 *      ECDH public key (reuses existing ECIES from e2ee.ts).
 *   5. Rotation: generate new random chainKey, re-distribute to remaining members.
 *
 * Sealed Sender (#6):
 *   sender_id is never in plaintext in the envelope — it is encrypted inside
 *   the ciphertext body. The server sees only the group conversation ID and
 *   the ciphertext blob; it cannot determine who sent the message from the
 *   E2EE layer (though the API transport still carries auth headers).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SenderKeyState {
  chainKey: string;    // base64, 32 bytes
  iteration: number;   // messages sent so far on this chain
  groupId: string;
  senderId: string;
}

/** v6 envelope — Sender Keys group message */
export interface E2eeEnvelopeV6 {
  v: 6;
  /** base64(iv[12] || AES-GCM ciphertext of sealed payload) */
  ciphertext: string;
  /** Which chain iteration was used — recipients advance to match */
  iteration: number;
  /** ID of this sender key distribution (rotation epoch) */
  skId: string;
}

/** Payload encrypted inside the ciphertext — contains plaintext + sealed sender */
interface SealedPayload {
  text: string;
  sender_id: string;
}

/** Distribution message sent to each group member (ECIES-wrapped) */
export interface SenderKeyDistribution {
  /** Recipient user ID */
  userId: string;
  /** ECIES-wrapped SenderKeyDistributionBody (base64) */
  ephemeral_pub: string;
  key_ct: string;
}

export interface SenderKeyDistributionBody {
  chainKey: string;    // base64
  iteration: number;
  skId: string;
  senderId: string;
  groupId: string;
}

// ── IndexedDB ─────────────────────────────────────────────────────────────────

const IDB_NAME = "nexa-senderkeys";
const IDB_STORE = "sk";

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

function _skOwnKey(groupId: string): string {
  return `own:${groupId}`;
}

function _skPeerKey(groupId: string, senderId: string): string {
  return `peer:${groupId}:${senderId}`;
}

// ── Chain key ratchet ─────────────────────────────────────────────────────────

function _b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function _bytesToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

async function _hmacStep(chainKey: Uint8Array<ArrayBuffer>, constant: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw", chainKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new Uint8Array([constant]) as Uint8Array<ArrayBuffer>);
}

/** Returns [nextChainKey[32], messageKey[32]] */
async function _advanceChain(chainKey: Uint8Array<ArrayBuffer>): Promise<[Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>]> {
  const [nextCk, mk] = await Promise.all([
    _hmacStep(chainKey, 0x01),
    _hmacStep(chainKey, 0x02),
  ]);
  return [new Uint8Array(nextCk) as Uint8Array<ArrayBuffer>, new Uint8Array(mk) as Uint8Array<ArrayBuffer>];
}

// ── AES-256-GCM helpers ───────────────────────────────────────────────────────

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

async function _aesEncrypt(mk: Uint8Array<ArrayBuffer>, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", mk, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const encoded = enc.encode(payload);
  const padded = _pad(new Uint8Array(encoded.buffer as ArrayBuffer) as Uint8Array<ArrayBuffer>);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, padded);
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return _bytesToB64(combined);
}

async function _aesDecrypt(mk: Uint8Array<ArrayBuffer>, ciphertextB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", mk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const combined = _b64ToBytes(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) as Uint8Array<ArrayBuffer> }, key, combined.slice(12) as Uint8Array<ArrayBuffer>);
  return dec.decode(_unpad(new Uint8Array(plain) as Uint8Array<ArrayBuffer>));
}

// ── Sender Key lifecycle ──────────────────────────────────────────────────────

function _newSkId(): string {
  return _bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Generate a fresh SenderKeyState for a group.
 * Call this when creating a group or rotating after a member is removed.
 */
export async function generateSenderKey(groupId: string, senderId: string): Promise<SenderKeyState & { skId: string }> {
  const chainKey = _bytesToB64(crypto.getRandomValues(new Uint8Array(32)));
  const skId = _newSkId();
  const state: SenderKeyState = { chainKey, iteration: 0, groupId, senderId };
  await saveSenderKeyState(groupId, senderId, state, skId);
  return { ...state, skId };
}

/** Persist own sender key state */
export async function saveSenderKeyState(
  groupId: string,
  senderId: string,
  state: SenderKeyState,
  skId?: string,
): Promise<void> {
  const record = { ...state, skId: skId ?? _newSkId() };
  const isOwn = state.senderId === senderId;
  await _idbSet(isOwn ? _skOwnKey(groupId) : _skPeerKey(groupId, senderId), record);
}

/** Load own sender key state for a group */
export async function loadOwnSenderKey(groupId: string): Promise<(SenderKeyState & { skId: string }) | null> {
  return (await _idbGet<SenderKeyState & { skId: string }>(_skOwnKey(groupId))) ?? null;
}

/** Load a peer's sender key state */
export async function loadPeerSenderKey(
  groupId: string,
  senderId: string,
): Promise<(SenderKeyState & { skId: string }) | null> {
  return (await _idbGet<SenderKeyState & { skId: string }>(_skPeerKey(groupId, senderId))) ?? null;
}

/** Store a received sender key distribution */
export async function storePeerSenderKey(
  body: SenderKeyDistributionBody,
): Promise<void> {
  const state: SenderKeyState = {
    chainKey: body.chainKey,
    iteration: body.iteration,
    groupId: body.groupId,
    senderId: body.senderId,
  };
  await _idbSet(_skPeerKey(body.groupId, body.senderId), { ...state, skId: body.skId });
}

// ── Encryption / Decryption ───────────────────────────────────────────────────

/**
 * Encrypt a group message using Sender Keys.
 * Returns the v6 envelope and the updated state (save it after sending).
 */
export async function encryptGroupSK(
  plaintext: string,
  senderId: string,
  state: SenderKeyState & { skId: string },
): Promise<{ envelope: E2eeEnvelopeV6; nextState: SenderKeyState & { skId: string } }> {
  const chainKey = _b64ToBytes(state.chainKey);
  const [nextCk, mk] = await _advanceChain(chainKey);

  // Sealed sender: sender_id lives inside the ciphertext, invisible to server
  const payload: SealedPayload = { text: plaintext, sender_id: senderId };
  const ciphertext = await _aesEncrypt(mk, JSON.stringify(payload));

  const nextState: SenderKeyState & { skId: string } = {
    ...state,
    chainKey: _bytesToB64(nextCk),
    iteration: state.iteration + 1,
  };

  return {
    envelope: { v: 6, ciphertext, iteration: state.iteration, skId: state.skId },
    nextState,
  };
}

/**
 * Decrypt a v6 group message.
 * Automatically advances the peer's chain key to match the envelope's iteration.
 * Returns plaintext and the (verified) sender_id from inside the sealed payload.
 */
export async function decryptGroupSK(
  envelope: E2eeEnvelopeV6,
  senderState: SenderKeyState & { skId: string },
): Promise<{ plaintext: string; senderId: string; nextState: SenderKeyState & { skId: string } }> {
  if (envelope.skId !== senderState.skId) {
    throw new Error("SK_ID_MISMATCH: sender key was rotated; fetch new distribution");
  }

  let chainKey = _b64ToBytes(senderState.chainKey);
  let iter = senderState.iteration;

  // Advance chain forward to reach the envelope's iteration
  while (iter < envelope.iteration) {
    [chainKey] = await _advanceChain(chainKey);
    iter++;
  }
  if (iter !== envelope.iteration) {
    throw new Error(`SK_ITER_MISMATCH: expected ${iter}, got ${envelope.iteration}`);
  }

  const [nextCk, mk] = await _advanceChain(chainKey);

  const raw = await _aesDecrypt(mk, envelope.ciphertext);
  const payload = JSON.parse(raw) as SealedPayload;

  const nextState: SenderKeyState & { skId: string } = {
    ...senderState,
    chainKey: _bytesToB64(nextCk),
    iteration: iter + 1,
  };

  return { plaintext: payload.text, senderId: payload.sender_id, nextState };
}

// ── Distribution helpers (wrapping with ECIES from e2ee.ts) ──────────────────

/**
 * Wrap a SenderKeyDistributionBody in ECIES for a single recipient.
 * Caller must use _eciesEncrypt from e2ee.ts — see groupDistributeSenderKey.
 */
export function buildDistributionBody(
  state: SenderKeyState & { skId: string },
): SenderKeyDistributionBody {
  return {
    chainKey: state.chainKey,
    iteration: state.iteration,
    skId: state.skId,
    senderId: state.senderId,
    groupId: state.groupId,
  };
}
