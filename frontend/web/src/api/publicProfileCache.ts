import { ApiError } from "./client";
import { fetchPublicProfile } from "./profile";
import type { PublicProfile } from "@/types/profile";

/**
 * Process-lifetime cache + in-flight dedup for public profiles.
 *
 * Several components resolve the same peer at once (chat header, profile panel,
 * profile page, conversation-list peer resolution). Without sharing, each fired
 * its own `GET /users/:id` — the source of the duplicate-request storm. This
 * module guarantees at most one request per user id, and negative-caches a
 * definitive 404 so a missing user is never re-fetched.
 *
 * Cache values: `PublicProfile` = found, `null` = known-not-found (404).
 * A missing key = unknown (never fetched, or only transient failures so far).
 */
const cache = new Map<string, PublicProfile | null>();
const inflight = new Map<string, Promise<PublicProfile | null>>();

/** Synchronous read. `undefined` = unknown, `null` = known 404, else the profile. */
export function getCachedPublicProfile(
  userId: string | undefined | null,
): PublicProfile | null | undefined {
  if (!userId) return undefined;
  return cache.has(userId) ? cache.get(userId) : undefined;
}

/** Deduped, cached load. Resolves to the profile, or `null` if not found / failed. */
export function loadPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (cache.has(userId)) return Promise.resolve(cache.get(userId) ?? null);

  const existing = inflight.get(userId);
  if (existing) return existing;

  const p = fetchPublicProfile(userId)
    .then((profile) => {
      cache.set(userId, profile);
      return profile;
    })
    .catch((e: unknown) => {
      // Negative-cache a definitive "not found" so we never re-request it.
      // Transient failures (network / 5xx) are NOT cached, so a later attempt
      // can still succeed.
      if (e instanceof ApiError && e.status === 404) {
        cache.set(userId, null);
      }
      return null;
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, p);
  return p;
}

/** Drop a cached entry (e.g. after the peer updates their profile). */
export function invalidatePublicProfile(userId: string): void {
  cache.delete(userId);
}

/** Test-only: reset module state between cases. */
export function __resetPublicProfileCache(): void {
  cache.clear();
  inflight.clear();
}
