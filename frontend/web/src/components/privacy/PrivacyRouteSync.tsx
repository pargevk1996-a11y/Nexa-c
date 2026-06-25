import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { tryUnsealContent } from "@/security/privacySeal";

/** Keeps guest auth routes free of the screenshot shield after SPA navigations. */
export function PrivacyRouteSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    tryUnsealContent();
    // LockOverlay/LockProvider live OUTSIDE <Router>, so they can't use
    // useLocation(). Bridge route changes out to them via a window event so the
    // PIN overlay can hide itself on guest auth pages (e.g. after browser back).
    window.dispatchEvent(new CustomEvent("nexa:locationchange", { detail: { pathname } }));
  }, [pathname]);

  return null;
}
