import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  buildContentSecurityPolicy,
  SECURITY_RESPONSE_HEADERS,
  SECURITY_RESPONSE_HEADERS_STRICT,
} from "./src/security/headers";

const API_TARGET = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig(({ command }) => {
  const isDevServer = command === "serve";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: API_TARGET,
          changeOrigin: true,
          // Pass 302 from OAuth start/callback to the browser (do not follow upstream redirects in Vite).
          followRedirects: false,
        },
        "/api/v1/ws": {
          target: process.env.VITE_WS_PROXY_TARGET ?? "http://127.0.0.1:8009",
          ws: true,
          changeOrigin: true,
        },
        "/health": { target: API_TARGET, changeOrigin: true },
      },
      headers: {
        ...SECURITY_RESPONSE_HEADERS,
        "Content-Security-Policy": buildContentSecurityPolicy(isDevServer),
      },
    },
    preview: {
      headers: {
        ...SECURITY_RESPONSE_HEADERS_STRICT,
        "Content-Security-Policy": buildContentSecurityPolicy(false),
      },
    },
  };
});
