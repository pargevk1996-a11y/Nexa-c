/** In-memory + sessionStorage cache for signed media URLs and blob previews. */

import { getMediaBlobUrl, putMediaBlob } from "@/media/mediaBlobStore";

const URL_CACHE = new Map<string, { url: string; expiresAt: number }>();
const PREVIEW_CACHE = new Map<string, { url: string; expiresAt: number }>();
const BLOB_CACHE = new Map<string, string>();

export function cacheSignedUrl(mediaId: string, url: string, expiresInSec: number): void {
  URL_CACHE.set(mediaId, { url, expiresAt: Date.now() + expiresInSec * 1000 });
  try {
    sessionStorage.setItem(`media:url:${mediaId}`, JSON.stringify({ url, expiresAt: Date.now() + expiresInSec * 1000 }));
  } catch {
    /* quota */
  }
}

export function cachePreviewUrl(mediaId: string, url: string, expiresInSec: number): void {
  PREVIEW_CACHE.set(mediaId, { url, expiresAt: Date.now() + expiresInSec * 1000 });
  try {
    sessionStorage.setItem(
      `media:preview:${mediaId}`,
      JSON.stringify({ url, expiresAt: Date.now() + expiresInSec * 1000 }),
    );
  } catch {
    /* quota */
  }
}

export function getCachedPreviewUrl(mediaId: string): string | null {
  const mem = PREVIEW_CACHE.get(mediaId);
  if (mem && mem.expiresAt > Date.now()) return mem.url;
  try {
    const raw = sessionStorage.getItem(`media:preview:${mediaId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; expiresAt: number };
    if (parsed.expiresAt <= Date.now()) return null;
    PREVIEW_CACHE.set(mediaId, parsed);
    return parsed.url;
  } catch {
    return null;
  }
}

export function getCachedSignedUrl(mediaId: string): string | null {
  const mem = URL_CACHE.get(mediaId);
  if (mem && mem.expiresAt > Date.now()) return mem.url;
  try {
    const raw = sessionStorage.getItem(`media:url:${mediaId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; expiresAt: number };
    if (parsed.expiresAt <= Date.now()) return null;
    URL_CACHE.set(mediaId, parsed);
    return parsed.url;
  } catch {
    return null;
  }
}

export function cacheBlobUrl(mediaId: string, blobUrl: string): void {
  BLOB_CACHE.set(mediaId, blobUrl);
}

export function getCachedBlobUrl(mediaId: string): string | undefined {
  return BLOB_CACHE.get(mediaId);
}

/** Persist blob in IndexedDB and return an object URL (demo caching). */
export async function cacheBlobPersistent(key: string, blob: Blob): Promise<string> {
  const existing = BLOB_CACHE.get(key);
  if (existing) return existing;
  await putMediaBlob(key, blob);
  const url = URL.createObjectURL(blob);
  BLOB_CACHE.set(key, url);
  return url;
}

/** Resolve blob URL from memory or IndexedDB. */
export async function resolveBlobUrl(key: string): Promise<string | null> {
  const mem = BLOB_CACHE.get(key);
  if (mem) return mem;
  const fromDb = await getMediaBlobUrl(key);
  if (fromDb) BLOB_CACHE.set(key, fromDb);
  return fromDb;
}

export function revokeBlobUrl(mediaId: string): void {
  const url = BLOB_CACHE.get(mediaId);
  if (url) URL.revokeObjectURL(url);
  BLOB_CACHE.delete(mediaId);
}
