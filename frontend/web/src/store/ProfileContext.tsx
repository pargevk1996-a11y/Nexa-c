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

/** The provider handle assigned at OAuth time (full Gmail or GitHub login),
 *  used as the profile @username. Falls back to the email, then the raw value. */
function deriveHandle(username?: string | null, email?: string | null): string {
  const u = username?.trim();
  // A space means this is a legacy display name, not a handle — prefer the email.
  if (u && !u.includes(" ")) return u;
  if (email?.trim()) return email.trim();
  return u ?? "";
}

/** Readable display name (nickname) used for the chat list & profile name.
 *  Prefers the OAuth display name stashed at sign-in, then any legacy
 *  display-name-as-username, then a Title-Cased email local part. */
function deriveDisplayName(
  oauthName: string | null,
  currentUsername: string,
  email?: string | null,
): string {
  if (oauthName?.trim()) return oauthName.trim();
  if (currentUsername.includes(" ")) return currentUsername.trim();
  const src = email?.split("@")[0] || currentUsername;
  return src
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function takeOAuthName(): string | null {
  try {
    const v = sessionStorage.getItem("nexa:oauth_name");
    if (v) sessionStorage.removeItem("nexa:oauth_name");
    return v;
  } catch {
    return null;
  }
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
    const oauthName = takeOAuthName();
    try {
      const p = await fetchMyProfile();
      // Self-heal: (a) legacy profiles where the @username was set to the display
      // name (contains a space) get a real handle; (b) empty nicknames get a
      // readable display name. Both keep existing accounts working without a
      // manual migration.
      const patch: { username?: string; nickname?: string } = {};
      if (p.username.includes(" ")) {
        patch.username = deriveHandle(s.user.username, s.user.email);
      }
      if (!p.nickname?.trim()) {
        patch.nickname = deriveDisplayName(oauthName, p.username, s.user.email);
      }
      if (Object.keys(patch).length > 0) {
        const patched = await updateMyProfile(patch).catch(() => p);
        setProfile({ ...patched, privacy: patched.privacy ?? DEFAULT_PROFILE_PRIVACY });
        return;
      }
      setProfile({ ...p, privacy: p.privacy ?? DEFAULT_PROFILE_PRIVACY });
    } catch {
      // Profile doesn't exist yet — bootstrap it (first sign-in only).
      const handle = deriveHandle(s.user.username, s.user.email);
      if (handle) {
        try {
          const nickname = deriveDisplayName(oauthName, handle, s.user.email);
          const p = await bootstrapProfile(handle, nickname || handle);
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
