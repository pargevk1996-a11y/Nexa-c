import { apiFetch, ApiError, isBackendUnavailable } from "./client";
import {
  clearSession,
  getCachedSession,
  persistSession,
  refreshSessionCache,
} from "@/security/sessionCache";
import { clearUserSecureStorage } from "@/security/secureStorage";
import type { AuthSession, LoginResult } from "@/types";

export type OAuthProvider = "google" | "github";

export { getCachedSession, refreshSessionCache };

/** @deprecated Use getCachedSession() after bootstrapSecurity(). */
export function loadStoredSession(): AuthSession | null {
  return getCachedSession();
}

export async function storeSession(session: AuthSession | null): Promise<void> {
  if (session) {
    await persistSession(session);
    return;
  }
  await clearSession();
}

/** Gateway origin for full-page OAuth redirects (bypasses Vite dev proxy). */
function getApiPublicOrigin(): string {
  const fromEnv = import.meta.env.VITE_API_PUBLIC_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
  return window.location.origin;
}

export function getOAuthStartUrl(provider: OAuthProvider, mode: "register" | "login" = "login"): string {
  return `${getApiPublicOrigin()}/api/v1/auth/oauth/${provider}/start?mode=${mode}`;
}

export function startOAuthLogin(provider: OAuthProvider, mode: "register" | "login" = "login"): void {
  window.location.assign(getOAuthStartUrl(provider, mode));
}

export async function loginWithPassword(identifier: string, password: string): Promise<LoginResult> {
  try {
    const data = await apiFetch<{
      user?: AuthSession["user"];
      access_token?: string;
      expires_in?: number;
      requires_2fa?: boolean;
      challenge_token?: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (data.requires_2fa && data.challenge_token) {
      return { ok: false, requires2fa: true, challengeId: data.challenge_token };
    }
    if (!data.user) {
      return { ok: false, code: "LOGIN_FAILED", message: "Unexpected login response" };
    }
    const session: AuthSession = {
      user: data.user,
      expiresIn: data.expires_in,
      demoMode: false,
    };
    await storeSession(session);
    return { ok: true, session };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === "EMAIL_NOT_VERIFIED") {
        return { ok: false, emailNotVerified: true };
      }
      if (e.code === "PASSWORD_RESET_REQUIRED") {
        return {
          ok: false,
          code: e.code,
          passwordResetRequired: true,
          message:
            "This account is locked after too many failed sign-in attempts. Reset your password to continue.",
        };
      }
      return { ok: false, code: e.code ?? "LOGIN_FAILED", message: e.message, details: e.details };
    }
    if (isBackendUnavailable(e)) {
      return {
        ok: false,
        code: "NETWORK",
        message: "Server unavailable. Start the gateway and auth-service (make dev-up).",
      };
    }
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}

export type RegisterResult =
  | { ok: true; message: string }
  | { ok: false; code: string; message: string; details?: string[] };

export async function completeLogin2fa(challengeId: string, code: string): Promise<LoginResult> {
  try {
    const data = await apiFetch<{
      user: AuthSession["user"];
      expires_in: number;
    }>("/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ challenge_token: challengeId, code }),
    });
    const session: AuthSession = {
      user: data.user,
      expiresIn: data.expires_in,
      demoMode: false,
    };
    await storeSession(session);
    return { ok: true, session };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, code: e.code ?? "INVALID_2FA", message: e.message };
    }
    if (isBackendUnavailable(e)) {
      return {
        ok: false,
        code: "NETWORK",
        message: "Server unavailable. Start the gateway and auth-service (make dev-up).",
      };
    }
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}

export async function registerAccount(
  email: string | null,
  password: string,
  username: string,
  phone?: string,
): Promise<RegisterResult> {
  try {
    const data = await apiFetch<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        ...(email ? { email } : {}),
        password,
        username,
        ...(phone ? { phone } : {}),
      }),
    });
    return { ok: true, message: data.message };
  } catch (e) {
    if (e instanceof ApiError) {
      return {
        ok: false,
        code: e.code ?? "REGISTER_FAILED",
        message: e.message,
        details: e.details.length ? e.details : undefined,
      };
    }
    if (isBackendUnavailable(e)) {
      return {
        ok: false,
        code: "NETWORK",
        message: "Server unavailable. Start the gateway and auth-service (make dev-up).",
      };
    }
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}

export async function completeOAuthCallback(params: URLSearchParams): Promise<LoginResult> {
  const error = params.get("error");
  const provider = params.get("provider");

  if (error) {
    if (error === "oauth_disabled") {
      return {
        ok: false,
        code: "OAUTH_DISABLED",
        message: "OAuth sign-in is disabled. Use email and password instead.",
      };
    }
    if (error === "oauth_not_configured") {
      return {
        ok: false,
        code: "OAUTH_NOT_CONFIGURED",
        message:
          "OAuth is not configured on the server. Add GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID to .env and restart auth-service.",
      };
    }
    if (error === "account_not_found") {
      return {
        ok: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "Account not found. Please complete registration before signing in.",
      };
    }
    if (error === "account_exists") {
      return {
        ok: false,
        code: "ACCOUNT_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      };
    }
    const message =
      error === "access_denied"
        ? "Sign-in was cancelled."
        : error === "oauth_token_failed"
          ? "Google/GitHub token exchange failed. Check redirect URI and client secret in .env."
          : "We could not complete sign-in. Please try again.";
    return { ok: false, code: "OAUTH_ERROR", message };
  }

  const exchange = params.get("exchange");
  if (!exchange) {
    return {
      ok: false,
      code: "OAUTH_ERROR",
      message: "Invalid response from the provider. Please try signing in again.",
    };
  }

  try {
    const data = await apiFetch<{
      user: AuthSession["user"];
      expires_in: number;
    }>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ exchange }),
    });
    const session: AuthSession = {
      user: data.user,
      expiresIn: data.expires_in,
      demoMode: false,
    };
    await storeSession(session);
    void revokeOtherSessions().catch(() => {});
    return { ok: true, session };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, code: e.code ?? "OAUTH_ERROR", message: e.message };
    }
    if (isBackendUnavailable(e)) {
      return {
        ok: false,
        code: "NETWORK",
        message: "Server unavailable. Start the gateway and auth-service (make dev-up).",
      };
    }
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}

/**
 * Calls /auth/oauth/exchange and returns the session WITHOUT storing it.
 * Use when the caller needs to inspect the session (e.g. check PIN) before
 * committing it to storage and navigating into the app.
 */
export async function fetchOAuthSession(exchange: string): Promise<{ ok: true; session: AuthSession } | { ok: false; code: string; message: string }> {
  try {
    const data = await apiFetch<{
      user: AuthSession["user"];
      expires_in: number;
    }>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ exchange }),
    });
    return {
      ok: true,
      session: { user: data.user, expiresIn: data.expires_in, demoMode: false },
    };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, code: e.code ?? "OAUTH_ERROR", message: e.message };
    }
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}

export async function logout(): Promise<void> {
  const session = getCachedSession();
  try {
    if (session?.user?.id && !session?.demoMode) {
      await apiFetch("/auth/logout", { method: "POST" });
    }
  } catch {
    /* best-effort */
  }
  if (session?.user.id) {
    clearUserSecureStorage(session.user.id);
  }
  await clearSession();
}

export async function refreshAccessToken(): Promise<AuthSession | null> {
  try {
    const data = await apiFetch<{
      user: AuthSession["user"];
      expires_in: number;
    }>("/auth/refresh", { method: "POST", body: JSON.stringify({}) });
    const session: AuthSession = {
      user: data.user,
      expiresIn: data.expires_in,
      demoMode: false,
    };
    await storeSession(session);
    return session;
  } catch (err) {
    // Only tear the session down on a CONFIRMED auth failure — the refresh
    // cookie is genuinely invalid/expired/revoked (401/403). A transient error
    // (network blip, backend unreachable, 5xx) must NOT log the user out and
    // bounce them to the landing page: keep the existing session so a later
    // retry (focus refresh / next request) recovers without re-login.
    const authFailed =
      err instanceof ApiError && (err.status === 401 || err.status === 403);
    if (authFailed) {
      await clearSession();
      return null;
    }
    return getCachedSession();
  }
}

export interface DeviceSession {
  id: string;
  device_label: string;
  created_at: string;
  last_used_at: string;
  ip_hint: string | null;
  current: boolean;
}

export async function listSessions(): Promise<DeviceSession[]> {
  return apiFetch<DeviceSession[]>("/auth/sessions");
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiFetch(`/auth/sessions/${sessionId}`, { method: "DELETE" });
}

export async function resendVerificationEmail(email: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return data.message;
}

export async function verifyEmail(email: string, code: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return data.message;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return data.message;
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export interface QrLoginStart {
  qr_token: string;
  expires_at: string;
  poll_url: string;
}

export async function startQrLogin(): Promise<QrLoginStart> {
  return apiFetch<QrLoginStart>("/auth/qr/start", { method: "POST" });
}

export async function pollQrLogin(token: string): Promise<{
  status: string;
  access_token?: string;
  expires_in?: number;
  user?: AuthSession["user"];
}> {
  // Token goes in a header, never the URL (avoids access-log / history leakage).
  return apiFetch(`/auth/qr/poll`, { headers: { "X-QR-Token": token } });
}

export async function approveQrLogin(qrToken: string): Promise<void> {
  await apiFetch("/auth/qr/approve", {
    method: "POST",
    body: JSON.stringify({ qr_token: qrToken }),
  });
}

export async function setup2fa(): Promise<{ secret: string; provisioning_uri: string }> {
  return apiFetch("/auth/2fa/setup", { method: "POST" });
}

export async function confirm2fa(code: string): Promise<{ backup_codes: string[]; message: string }> {
  return apiFetch("/auth/2fa/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function sendPhoneCode(phone: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/phone/send-code", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  return data.message;
}

export async function verifyPhone(phone: string, code: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/phone/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  return data.message;
}

export interface AuthConfig {
  oauth_enabled: boolean;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  return apiFetch<AuthConfig>("/auth/config");
}

export interface SecurityStatus {
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  totp_enabled: boolean;
  webauthn_credentials: number;
  active_sessions: number;
}

export async function fetchSecurityStatus(): Promise<SecurityStatus> {
  return apiFetch<SecurityStatus>("/auth/me/security");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  return data.message;
}

export async function fetch2faStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/auth/2fa/status");
}

export async function disable2fa(code: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return data.message;
}

export async function revokeOtherSessions(): Promise<{ revoked: number; message: string }> {
  return apiFetch<{ revoked: number; message: string }>("/auth/sessions/revoke-others", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function registerWebAuthnCredential(
  credentialId: string,
  publicKey: string,
  deviceLabel?: string,
): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/webauthn/register", {
    method: "POST",
    body: JSON.stringify({
      credential_id: credentialId,
      public_key: publicKey,
      device_label: deviceLabel,
    }),
  });
  return data.message;
}

export async function removeWebAuthnCredentials(): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/webauthn/credentials", {
    method: "DELETE",
  });
  return data.message;
}

export interface WebAuthnDevice {
  id: string;
  credential_id: string;
  device_label: string;
}

export async function listWebAuthnDevices(): Promise<WebAuthnDevice[]> {
  return apiFetch<WebAuthnDevice[]>("/auth/webauthn/credentials");
}

// --- Opt-in biometric (Face ID / fingerprint) PIN unlock, mobile only -------

/** Register this device's platform authenticator for biometric PIN unlock. */
export async function registerBiometric(
  credentialId: string,
  publicKey: string,
  deviceLabel?: string,
): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/biometric/register", {
    method: "POST",
    body: JSON.stringify({
      credential_id: credentialId,
      public_key: publicKey,
      device_label: deviceLabel,
    }),
  });
  return data.message;
}

export async function getBiometricStatus(): Promise<{ enabled: boolean; count: number }> {
  return apiFetch<{ enabled: boolean; count: number }>("/auth/biometric/status");
}

export async function removeBiometric(): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/biometric", { method: "DELETE" });
  return data.message;
}

/** Begin a biometric PIN unlock: server issues a fresh single-use challenge. */
export async function startBiometricUnlock(): Promise<{
  challenge: string;
  credential_ids: string[];
}> {
  return apiFetch("/auth/biometric/pin/start", { method: "POST", body: JSON.stringify({}) });
}

/** Finish a biometric PIN unlock — backend verifies the assertion and (on
 *  success) reissues the access cookie with pin_verified=true. */
export async function finishBiometricUnlock(input: {
  credentialId: string;
  challenge: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}): Promise<PinStatusResult> {
  return apiFetch<PinStatusResult>("/auth/biometric/pin/verify", {
    method: "POST",
    body: JSON.stringify({
      credential_id: input.credentialId,
      challenge: input.challenge,
      authenticator_data: input.authenticatorData,
      client_data_json: input.clientDataJSON,
      signature: input.signature,
    }),
  });
}

export async function deleteAccount(password: string, confirmText: string): Promise<string> {
  const data = await apiFetch<{ message: string }>("/auth/account/delete", {
    method: "POST",
    body: JSON.stringify({ password, confirm_text: confirmText }),
  });
  return data.message;
}

export async function startWebAuthnLogin(email: string): Promise<{
  challenge: string;
  credential_ids: string[];
}> {
  return apiFetch("/auth/webauthn/login/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function finishWebAuthnLogin(
  email: string,
  credentialId: string,
  challenge: string,
): Promise<LoginResult> {
  try {
    const data = await apiFetch<{
      user: AuthSession["user"];
      expires_in: number;
    }>("/auth/webauthn/login/finish", {
      method: "POST",
      body: JSON.stringify({ email, credential_id: credentialId, challenge }),
    });
    const session: AuthSession = {
      user: data.user,
      expiresIn: data.expires_in,
      demoMode: false,
    };
    await storeSession(session);
    return { ok: true, session };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, code: e.code ?? "WEBAUTHN_FAILED", message: e.message };
    }
    return { ok: false, code: "NETWORK", message: "Biometric sign-in failed" };
  }
}

export interface PinStatusResult {
  pin_status: "PENDING_PIN" | "ACTIVE";
  pin_verified: boolean;
}

export async function setupPin(pin: string): Promise<PinStatusResult> {
  return apiFetch<PinStatusResult>("/auth/pin/setup", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function verifyPin(pin: string): Promise<PinStatusResult> {
  return apiFetch<PinStatusResult>("/auth/pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function getPinStatus(): Promise<PinStatusResult> {
  return apiFetch<PinStatusResult>("/auth/pin/status");
}

/** Lock all sessions — server clears pin_verified_at everywhere and fires a WS
 *  event so every connected device immediately shows the PIN lock screen. */
export async function lockSession(): Promise<void> {
  await apiFetch("/auth/pin/lock", { method: "POST" });
}

/** Abort registration at the PIN-creation step (only while PENDING_PIN).
 *  Deletes the just-created account and clears the local session. */
export async function cancelPinSetup(): Promise<void> {
  const session = getCachedSession();
  try {
    await apiFetch("/auth/pin/cancel", { method: "POST" });
  } catch {
    /* best-effort — clear locally regardless */
  }
  if (session?.user?.id) {
    clearUserSecureStorage(session.user.id);
  }
  await clearSession();
}
