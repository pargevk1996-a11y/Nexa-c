import { features } from "@/features/registry";

/** When false, UI uses email/password; OAuth code stays for later re-enable. */
export function isOAuthEnabled(): boolean {
  const v = import.meta.env.VITE_OAUTH_ENABLED;
  if (v === undefined || v === "") return false;
  return v !== "false" && v !== "0";
}

/** Platform authenticator (Touch ID / Face ID / fingerprint) — off on web. */
export function isWebAuthnEnabled(): boolean {
  const v = import.meta.env.VITE_WEBAUTHN_ENABLED;
  if (v !== undefined && v !== "") {
    return v !== "false" && v !== "0";
  }
  return features.auth.webauthn;
}

export function isQrLoginEnabled(): boolean {
  const v = import.meta.env.VITE_QR_LOGIN_ENABLED;
  if (v !== undefined && v !== "") {
    return v !== "false" && v !== "0";
  }
  return features.auth.qrLogin;
}

/** Standalone verify-email page and footer link — off on web (AUTO_VERIFY_EMAIL in dev). */
export function isEmailVerificationUiEnabled(): boolean {
  const v = import.meta.env.VITE_EMAIL_VERIFICATION_UI_ENABLED;
  if (v !== undefined && v !== "") {
    return v !== "false" && v !== "0";
  }
  return features.auth.emailVerification;
}
