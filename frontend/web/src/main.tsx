import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "@/pwa/registerServiceWorker";
import { installPrivacySeal } from "@/security/privacySeal";
import App from "./App";
import "./styles/global.css";

installPrivacySeal();
registerServiceWorker();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
