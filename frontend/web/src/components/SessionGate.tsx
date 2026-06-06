import { useEffect, useState, type ReactNode } from "react";
import { BootstrapScreen } from "@/components/layout/BootstrapScreen";
import { hydrateOfflineQueue } from "@/realtime/offlineQueue";
import { bootstrapSecurity } from "@/security/bootstrap";
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

  if (phase === "loading") {
    return <BootstrapScreen />;
  }

  return children;
}
