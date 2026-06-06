/** Product branding — override via VITE_BRAND_NAME at build time. */
export const BRAND_NAME =
  (import.meta.env.VITE_BRAND_NAME as string | undefined)?.trim() || "NEXA";

export const BRAND_MARK =
  (import.meta.env.VITE_BRAND_MARK as string | undefined)?.trim() || "NX";

export const BRAND_TAGLINE = "Private messaging with clarity and control";

/** Served from `frontend/web/public/` */
export const BRAND_LOGO_URL = "/nexa-logo.png";
export const BRAND_FAVICON_URL = "/favicon.png";
