import { useEffect, useState } from "react";
import { getCachedSession } from "@/api/auth";
import {
  getCachedPublicProfile,
  loadPublicProfile,
  subscribePublicProfile,
} from "@/api/publicProfileCache";
import type { PublicProfile } from "@/types/profile";

export function usePublicProfile(userId: string | undefined) {
  // Seed synchronously from the shared cache so re-mounts don't re-fetch and
  // there is no loading flash for an already-known peer.
  const [profile, setProfile] = useState<PublicProfile | null>(
    () => getCachedPublicProfile(userId) ?? null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const session = getCachedSession();
    if (!session?.user?.id || session?.demoMode) {
      setProfile(null);
      return;
    }

    // Already resolved (found or known-404) → use it, no request.
    const cached = getCachedPublicProfile(userId);
    if (cached !== undefined) {
      setProfile(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadPublicProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-render when the cached profile is refreshed out-of-band (presence poll),
  // so the online dot and last-seen text stay live and in sync.
  useEffect(() => {
    if (!userId) return;
    return subscribePublicProfile(userId, () => {
      setProfile(getCachedPublicProfile(userId) ?? null);
    });
  }, [userId]);

  return { profile, loading };
}
