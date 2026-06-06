import { IDB_STORES, idbGet, idbPut } from "@/cache/idb";
import { useRealtimeStore } from "@/store/zustand/realtimeStore";
import type { PendingOutbound } from "./types";

const STORAGE_KEY = "nexa:offline:outbound";
const IDB_KEY = "offline:outbound";

let memoryQueue: PendingOutbound[] | null = null;
let hydratePromise: Promise<void> | null = null;

function syncRealtimeCount(queue: PendingOutbound[]): void {
  useRealtimeStore.getState().setOfflineQueueCount(queue.length);
}

function readLocalStorageQueue(): PendingOutbound[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOutbound[];
  } catch {
    return [];
  }
}

function writeLocalStorageQueue(queue: PendingOutbound[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* quota */
  }
}

async function persistQueue(queue: PendingOutbound[]): Promise<void> {
  memoryQueue = queue;
  writeLocalStorageQueue(queue);
  syncRealtimeCount(queue);
  await idbPut(IDB_STORES.kv, IDB_KEY, queue);
}

/** Load outbound queue from IndexedDB (with localStorage migration). Call once at app boot. */
export async function hydrateOfflineQueue(): Promise<void> {
  if (memoryQueue) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const fromIdb = await idbGet<PendingOutbound[]>(IDB_STORES.kv, IDB_KEY);
    if (fromIdb?.length) {
      memoryQueue = fromIdb;
      writeLocalStorageQueue(fromIdb);
      syncRealtimeCount(fromIdb);
      return;
    }
    const fromLs = readLocalStorageQueue();
    memoryQueue = fromLs;
    syncRealtimeCount(fromLs);
    if (fromLs.length) await idbPut(IDB_STORES.kv, IDB_KEY, fromLs);
  })();
  return hydratePromise;
}

export function loadOfflineQueue(): PendingOutbound[] {
  if (!memoryQueue) memoryQueue = readLocalStorageQueue();
  return memoryQueue;
}

export function saveOfflineQueue(queue: PendingOutbound[]): void {
  void persistQueue(queue);
}

export function enqueueOutbound(item: PendingOutbound): void {
  const q = loadOfflineQueue();
  q.push(item);
  saveOfflineQueue(q);
}

export function removeOutbound(clientMsgId: string): void {
  saveOfflineQueue(loadOfflineQueue().filter((x) => x.clientMsgId !== clientMsgId));
}

export function bumpAttempt(clientMsgId: string): void {
  const q = loadOfflineQueue().map((x) =>
    x.clientMsgId === clientMsgId ? { ...x, attempts: x.attempts + 1 } : x,
  );
  saveOfflineQueue(q);
}
