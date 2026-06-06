import { useEffect, useState } from "react";
import { fetchPublicProfile } from "@/api/profile";
import { getCachedSession } from "@/api/auth";
import type { PublicProfile } from "@/types/profile";

export function usePublicProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const session = getCachedSession();
    if (!session?.accessToken || session.demoMode) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPublicProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { profile, loading };
}
