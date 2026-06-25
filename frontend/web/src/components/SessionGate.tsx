import { useEffect, useState, type ReactNode } from "react";
import { BootstrapScreen } from "@/components/layout/BootstrapScreen";
import { hydrateOfflineQueue } from "@/realtime/offlineQueue";
import { bootstrapSecurity, initUserSecurity } from "@/security/bootstrap";
import { tryUnsealContent } from "@/security/privacySeal";

type Phase = "loading" | "ready";

/** Wait for encrypted session restore before routing (avoids flash / wrong redirects). */
export function SessionGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([bootstrapSecurity(), hydrateOfflineQueue()])
      .catch((err) => {
        console.error("Security bootstrap failed:", err);
      })
      .finally(() => {
        if (!cancelled) {
          tryUnsealContent();
          setPhase("ready");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A login that happens WITHOUT a full page reload (email/SPA login, OAuth
  // callback) fires "securechat-session" but does NOT re-run the mount effect
  // above — so initialize the per-user E2EE keys here too, otherwise incoming
  // messages can't be decrypted until the user manually refreshes.
  useEffect(() => {
    const onSession = () => { void initUserSecurity(); };
    window.addEventListener("securechat-session", onSession);
    return () => window.removeEventListener("securechat-session", onSession);
  }, []);

  if (phase === "loading") {
    return <BootstrapScreen />;
  }

  return children;
}
