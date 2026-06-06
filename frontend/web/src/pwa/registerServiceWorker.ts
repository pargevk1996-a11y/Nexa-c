/**
 * Registers the production service worker (static shell cache + offline fallback).
 */

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_SW !== "true") return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        /* registration blocked or unsupported */
      });
  });
}
