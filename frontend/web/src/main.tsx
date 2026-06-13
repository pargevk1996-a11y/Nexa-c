import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
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

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
