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

function deriveNickname(username?: string | null, email?: string | null): string {
  // OAuth users get their display name stored as username (e.g. "John Smith" from Google).
  // If it already contains a space it's a proper display name — use it as-is.
  if (username?.includes(" ")) return username.trim();
  // For username-only logins, derive a readable name from the email local part.
  if (email) {
    const local = email.split("@")[0];
    return local
      .split(/[._\-+]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return username?.trim() ?? "";
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const session = getCachedSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const s = getCachedSession();
    if (!s?.user?.id || s?.demoMode) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const p = await fetchMyProfile();
      // If the profile exists but has no nickname yet (e.g. older OAuth account),
      // silently patch it so the profile page and chat list show a real name.
      if (!p.nickname?.trim() && (s.user.username || s.user.email)) {
        const nickname = deriveNickname(s.user.username, s.user.email);
        if (nickname) {
          const patched = await updateMyProfile({ nickname }).catch(() => p);
          setProfile({ ...patched, privacy: patched.privacy ?? DEFAULT_PROFILE_PRIVACY });
          return;
        }
      }
      setProfile({ ...p, privacy: p.privacy ?? DEFAULT_PROFILE_PRIVACY });
    } catch {
      // Profile doesn't exist yet — bootstrap it (first login only).
      const username = s.user.username;
      if (username) {
        try {
          const nickname = deriveNickname(username, s.user.email);
          const p = await bootstrapProfile(username, nickname || username);
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
  }, []);

  // Re-run after any login event (OAuth redirect sets session AFTER first render).
  useEffect(() => {
    const onSession = () => void refresh();
    window.addEventListener("securechat-session", onSession);
    return () => window.removeEventListener("securechat-session", onSession);
  }, [refresh]);

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
