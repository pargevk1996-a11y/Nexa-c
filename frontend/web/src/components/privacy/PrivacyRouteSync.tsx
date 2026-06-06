import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { tryUnsealContent } from "@/security/privacySeal";

/** Keeps guest auth routes free of the screenshot shield after SPA navigations. */
export function PrivacyRouteSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    tryUnsealContent();
  }, [pathname]);

  return null;
}
