// Device encryption base key — stored as a non-extractable CryptoKey in IndexedDB.
//
// Raw key bytes (32 random bytes) exist ONLY in memory during key generation and are
// immediately imported as a non-extractable HKDF key. The CryptoKey object is persisted
// to IndexedDB via the browser's structured-clone algorithm, which stores the key
// material inside the browser's own keystore — inaccessible to JavaScript even when
// the IDB record is read back. An attacker who can run JS in this origin can retrieve
// the opaque CryptoKey and USE it for WebCrypto operations (encrypt/decrypt/deriveKey)
// but CANNOT call exportKey() to exfiltrate the raw bytes.
//
// On browsers where IndexedDB is unavailable (some private-browsing modes) the key
// falls back to an in-memory module variable for the tab lifetime.

const DB_NAME = "nexa-security";
const DB_STORE = "device-keys";
const DEVICE_KEY_SLOT = "v2:device-hkdf";

let _cachedKey: CryptoKey | null = null;

function _openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      (req.result as IDBDatabase).createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result as IDBDatabase);
    req.onerror = () => reject(req.error);
  });
}

function _idbGet(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DEVICE_KEY_SLOT);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function _idbPut(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(DB_STORE, "readwrite")
      .objectStore(DB_STORE)
      .put(key, DEVICE_KEY_SLOT);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _idbDelete(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(DB_STORE, "readwrite")
      .objectStore(DB_STORE)
      .delete(DEVICE_KEY_SLOT);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function _generateKey(): Promise<CryptoKey> {
  const rawMaterial = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey(
    "raw",
    rawMaterial,
    "HKDF",
    false, // non-extractable: raw bytes never leave WebCrypto after this point
    ["deriveKey"],
  );
}

export async function getOrCreateDeviceBaseKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  try {
    const db = await _openDb();
    const stored = await _idbGet(db);
    if (stored) {
      _cachedKey = stored;
      return _cachedKey;
    }
    const newKey = await _generateKey();
    await _idbPut(db, newKey);
    _cachedKey = newKey;
    return _cachedKey;
  } catch {
    // IDB unavailable — memory-only fallback (private browsing, storage quota exceeded).
    if (!_cachedKey) _cachedKey = await _generateKey();
    return _cachedKey;
  }
}

export function hasDeviceKeyMaterial(): boolean {
  return _cachedKey !== null;
}

export async function destroyDeviceKeyMaterial(): Promise<void> {
  _cachedKey = null;
  try {
    const db = await _openDb();
    await _idbDelete(db);
  } catch {
    // Best-effort: if IDB fails the key is gone from memory at minimum.
  }
}
