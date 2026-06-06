import { useEffect } from "react";
import { installPrivacySeal } from "@/security/privacySeal";

/** Ensures site-wide capture protection is active (also installed from main.tsx before paint). */
export function usePrivacyGuard() {
  useEffect(() => {
    installPrivacySeal();
  }, []);
}
