/** IndexedDB blob cache keyed by message / attachment id (unified nexa-client DB). */

import { IDB_STORES, idbGet, idbMigrateLegacyMediaBlobs, idbPut } from "@/cache/idb";

let legacyMigrated = false;

async function ensureLegacyMigration(): Promise<void> {
  if (legacyMigrated) return;
  legacyMigrated = true;
  await idbMigrateLegacyMediaBlobs(async (key, blob) => {
    await idbPut(IDB_STORES.blobs, key, blob);
  });
}

export async function putMediaBlob(key: string, blob: Blob): Promise<void> {
  await ensureLegacyMigration();
  await idbPut(IDB_STORES.blobs, key, blob);
}

export async function getMediaBlob(key: string): Promise<Blob | null> {
  await ensureLegacyMigration();
  return await idbGet<Blob>(IDB_STORES.blobs, key);
}

export async function getMediaBlobUrl(key: string): Promise<string | null> {
  const blob = await getMediaBlob(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
