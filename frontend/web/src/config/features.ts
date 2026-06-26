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

/** Coarse mobile detection (phone / tablet) via the user-agent + touch. Used to
 *  scope the opt-in biometric (Face ID / fingerprint) unlock to mobile only. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Mobile/i.test(ua)) return true;
  // iPadOS 13+ reports a desktop UA but exposes touch points.
  return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
}

/** True on iOS / iPadOS — there the only platform authenticator is Face ID
 *  (or Touch ID), so the UI labels biometric as "Face ID" only. */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
}

/** Human label for the biometric method on this platform. */
export function biometricLabel(): string {
  return isIOSDevice() ? "Face ID" : "fingerprint or Face ID";
}

/** True when this device can offer the opt-in biometric unlock: mobile + a
 *  WebAuthn platform authenticator. This is independent of the legacy
 *  VITE_WEBAUTHN_ENABLED stub flag — the biometric PIN-unlock flow is real. */
export function isBiometricUnlockSupported(): boolean {
  return (
    isMobileDevice() &&
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

/** True when running inside the Nexa desktop (Electron) app. */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__NEXA_DESKTOP__ === true;
}

/** Standalone verify-email page and footer link — off on web (AUTO_VERIFY_EMAIL in dev). */
export function isEmailVerificationUiEnabled(): boolean {
  const v = import.meta.env.VITE_EMAIL_VERIFICATION_UI_ENABLED;
  if (v !== undefined && v !== "") {
    return v !== "false" && v !== "0";
  }
  return features.auth.emailVerification;
}
