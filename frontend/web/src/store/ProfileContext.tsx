import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { bootstrapProfile, fetchMyProfile, updateMyProfile, updatePresence } from "@/api/profile";
import { getCachedSession } from "@/api/auth";
import type { UserProfile } from "@/types/profile";
import { DEFAULT_PROFILE_PRIVACY } from "@/types/profile";

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Parameters<typeof updateMyProfile>[0]) => Promise<UserProfile>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function deriveNickname(email?: string | null, username?: string | null): string {
  if (email) {
    const local = email.split("@")[0];
    return local
      .split(/[._\-+]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return username ?? "";
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const session = getCachedSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user?.id || session?.demoMode) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const p = await fetchMyProfile();
      setProfile({ ...p, privacy: p.privacy ?? DEFAULT_PROFILE_PRIVACY });
    } catch {
      // Profile doesn't exist yet — bootstrap it (first login only)
      if (session.user.username) {
        try {
          const nickname = deriveNickname(session.user.email, session.user.username);
          const p = await bootstrapProfile(session.user.username, nickname || session.user.username);
          setProfile({ ...p, privacy: p.privacy ?? DEFAULT_PROFILE_PRIVACY });
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, session?.demoMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session?.user?.id || session?.demoMode) return;
    void updatePresence(true, profile?.status_text);
    const onVis = () => {
      void updatePresence(!document.hidden, profile?.status_text);
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(() => {
      if (!document.hidden) void updatePresence(true);
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
      void updatePresence(false);
    };
  }, [session?.user?.id, session?.demoMode, profile?.status_text]);

  const save = useCallback(
    async (patch: Parameters<typeof updateMyProfile>[0]) => {
      const updated = await updateMyProfile(patch);
      setProfile(updated);
      return updated;
    },
    [],
  );

  const value = useMemo(
    () => ({ profile, loading, refresh, save }),
    [profile, loading, refresh, save],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

export function useProfileOptional() {
  return useContext(ProfileContext);
}
