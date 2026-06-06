import { useEffect, useState } from "react";
import { getCachedSession, refreshSessionCache } from "@/security/sessionCache";
import { useSessionStore } from "@/store/zustand/sessionStore";
import type { AuthSession } from "@/types";

/** Reactive session for route guards (updates after login without full reload). */
export function useSession(): AuthSession | null {
  const [session, setSession] = useState<AuthSession | null>(() => getCachedSession());

  useEffect(() => {
    let cancelled = false;
    void refreshSessionCache().then((s) => {
      if (!cancelled) {
        setSession(s);
        useSessionStore
          .getState()
          .setSession(s?.user.id ?? null, Boolean(s?.demoMode));
      }
    });
    const onFocus = () => {
      void refreshSessionCache().then((s) => {
        if (!cancelled) {
          setSession(s);
          useSessionStore
            .getState()
            .setSession(s?.user.id ?? null, Boolean(s?.demoMode));
        }
      });
    };
    const onSession = () => {
      const s = getCachedSession();
      setSession(s);
      useSessionStore
        .getState()
        .setSession(s?.user.id ?? null, Boolean(s?.demoMode));
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("securechat-session", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("securechat-session", onSession);
    };
  }, []);

  return session ?? getCachedSession();
}
