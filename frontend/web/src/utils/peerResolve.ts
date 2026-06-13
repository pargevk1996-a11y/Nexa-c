import {
  __resetPublicProfileCache,
  getCachedPublicProfile,
  loadPublicProfile,
} from "@/api/publicProfileCache";
import { displayName } from "@/utils/presenceText";
import type { PublicProfile } from "@/types/profile";

export interface ResolvedPeer {
  name: string;
  username?: string;
  online: boolean;
}

function toResolved(p: PublicProfile): ResolvedPeer {
  return { name: displayName(p), username: p.username, online: Boolean(p.is_online) };
}

/** Synchronous read from the shared public-profile cache. */
export function getCachedPeer(userId: string | undefined | null): ResolvedPeer | null {
  const p = getCachedPublicProfile(userId);
  return p ? toResolved(p) : null;
}

/**
 * Resolve a DM peer's display fields. Backed by the shared profile cache so it
 * shares dedup/caching with `usePublicProfile` — a peer is fetched at most once
 * regardless of how many places ask for it (fixes the duplicate-request storm).
 */
export function resolvePeer(userId: string): Promise<ResolvedPeer | null> {
  const cached = getCachedPublicProfile(userId);
  if (cached !== undefined) return Promise.resolve(cached ? toResolved(cached) : null);
  return loadPublicProfile(userId).then((p) => (p ? toResolved(p) : null));
}

/** Test-only: reset module state between cases. */
export function __resetPeerCache() {
  __resetPublicProfileCache();
}
