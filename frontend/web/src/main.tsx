import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
import { startPerformanceGovernor } from "@/perf/performanceGovernor";
import { initScreenCaptureDefense } from "@/security/screenCaptureDefense";
import { applyTheme, getGlobalTheme } from "@/store/settings";
import App from "./App";
import "./styles/global.css";

// Apply the device-wide theme as early as possible (avoids a flash and keeps
// the light/dark choice consistent across home, auth, and the logged-in app).
applyTheme(getGlobalTheme());
// Best-effort screen-capture defense. Installs the privacy seal before paint and
// reports every detected attempt to the backend. (Real blocking lives in the
// native apps — a browser cannot truly stop screenshots.)
initScreenCaptureDefense();
registerServiceWorker();
// Auto-optimization: drop heavy visual effects under sustained jank, recover when smooth.
startPerformanceGovernor();

// Recover from stale lazy-chunk failures after a deploy: a cached index.html can
// reference hashed chunks that no longer exist (404) → blank screen on a route
// switch. Reload once (rate-limited) to pull a fresh index.html + correct chunks.
window.addEventListener("vite:preloadError", () => {
  // Only a stale post-deploy chunk warrants a reload. If we're offline the
  // chunk simply isn't reachable yet — reloading would just blank the screen,
  // so skip it and let the SW/offline path or a later retry handle it. The
  // reload preserves the current URL, so an online recovery lands the user back
  // on the same route (the session survives — see refreshSessionCache).
  if (!navigator.onLine) return;
  const last = Number(sessionStorage.getItem("nexa-chunk-reload") || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem("nexa-chunk-reload", String(Date.now()));
    window.location.reload();
  }
});

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
