/** Content-Security-Policy and related headers for the web client. */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const connectSrc = isDev
    ? "'self' http://127.0.0.1:8000 http://localhost:8000 http://127.0.0.1:5173 http://localhost:5173 ws://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:8009 ws://localhost:8009 https://accounts.google.com https://oauth2.googleapis.com https://github.com https://api.github.com https://openidconnect.googleapis.com"
    : "'self' https://accounts.google.com https://oauth2.googleapis.com https://github.com https://api.github.com https://openidconnect.googleapis.com";

  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self'";

  // Fonts are fully self-hosted (/fonts/*.woff2) — no third-party font origins needed.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    // 'unsafe-inline' kept only for dev (Vite injects <style> tags during HMR).
    isDev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    isDev ? "" : "upgrade-insecure-requests",
    isDev ? "" : "report-uri /api/v1/security/csp-report",
    isDev ? "" : "report-to csp-endpoint",
  ]
    .filter(Boolean)
    .join("; ");
}

export const SECURITY_RESPONSE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
};

/** Stricter isolation for production preview / static hosting. */
export const SECURITY_RESPONSE_HEADERS_STRICT: Record<string, string> = {
  ...SECURITY_RESPONSE_HEADERS,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // COEP safe here: all fonts/assets are self-hosted, zero cross-origin subresources.
  "Cross-Origin-Embedder-Policy": "require-corp",
};
