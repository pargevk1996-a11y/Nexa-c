/**
 * Unified IndexedDB layer for Nexa client (production-grade offline cache).
 * Stores: blobs (media), kv (JSON blobs), offline (outbound queue items).
 */

const DB_NAME = "nexa-client";
const DB_VERSION = 1;

export const IDB_STORES = {
  blobs: "blobs",
  kv: "kv",
  offline: "offline",
} as const;

export type IdbStoreName = (typeof IDB_STORES)[keyof typeof IDB_STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORES.blobs)) {
        db.createObjectStore(IDB_STORES.blobs);
      }
      if (!db.objectStoreNames.contains(IDB_STORES.kv)) {
        db.createObjectStore(IDB_STORES.kv);
      }
      if (!db.objectStoreNames.contains(IDB_STORES.offline)) {
        db.createObjectStore(IDB_STORES.offline, { keyPath: "clientMsgId" });
      }
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet<T>(store: IdbStoreName, key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbPut(store: IdbStoreName, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    if (store === IDB_STORES.offline) {
      os.put(value);
    } else {
      os.put(value, key);
    }
    await txDone(tx);
  } catch {
    /* quota / private mode */
  }
}

export async function idbDelete(store: IdbStoreName, key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await txDone(tx);
  } catch {
    /* ignore */
  }
}

export async function idbGetAll<T>(store: IdbStoreName): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbClearStore(store: IdbStoreName): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    await txDone(tx);
  } catch {
    /* ignore */
  }
}

/** Legacy DB migration: read once from nexa-media-blobs if present. */
export async function idbMigrateLegacyMediaBlobs(
  onEach: (key: string, blob: Blob) => Promise<void>,
): Promise<void> {
  try {
    const legacy = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open("nexa-media-blobs", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!legacy) return;
    const tx = legacy.transaction("blobs", "readonly");
    const store = tx.objectStore("blobs");
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const r = store.getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    for (const key of keys) {
      const k = String(key);
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const r = store.get(k);
        r.onsuccess = () => resolve((r.result as Blob) ?? null);
        r.onerror = () => reject(r.error);
      });
      if (blob) await onEach(k, blob);
    }
    legacy.close();
  } catch {
    /* ignore */
  }
}
