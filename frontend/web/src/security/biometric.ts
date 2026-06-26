/** Opt-in biometric (Face ID / fingerprint) PIN unlock — mobile browsers only.
 *
 * This is a REAL WebAuthn flow: registration stores the platform
 * authenticator's public key on the server; unlocking signs a fresh
 * server-issued challenge that the backend verifies before clearing the PIN
 * gate. The private key never leaves the device secure enclave, so a stolen
 * session cookie alone cannot unlock.
 *
 * Independent of the legacy `webauthn.ts` stub (which is gated off on web).
 */

import {
  finishBiometricUnlock,
  getBiometricStatus,
  registerBiometric,
  removeBiometric,
  startBiometricUnlock,
} from "@/api/auth";
import { isBiometricUnlockSupported } from "@/config/features";

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const ENABLED_KEY = "nexa:biometric_enabled";

/** Local hint that this device opted in — drives whether the lock screen shows
 *  the biometric button without a network round-trip. The server remains the
 *  source of truth (the unlock still verifies a real assertion). */
export function isBiometricEnabledLocally(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function setBiometricEnabledLocally(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore storage failures */
  }
}

/** True when this device can offer biometric unlock (mobile + a real platform
 *  authenticator that supports user verification). */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isBiometricUnlockSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Register this device's platform authenticator and remember the opt-in. */
export async function enableBiometric(userId: string, username: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Nexa", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!cred || !(cred.response instanceof AuthenticatorAttestationResponse)) return false;
    const pubKey = cred.response.getPublicKey();
    if (!pubKey) return false;

    await registerBiometric(
      bufferToBase64url(cred.rawId),
      bufferToBase64url(pubKey),
      "This device",
    );
    setBiometricEnabledLocally(true);
    return true;
  } catch {
    return false;
  }
}

/** Disable biometric unlock for this account (removes server credentials). */
export async function disableBiometric(): Promise<void> {
  setBiometricEnabledLocally(false);
  try {
    await removeBiometric();
  } catch {
    /* best-effort */
  }
}

/** Whether biometric is registered for this account on the server. */
export async function biometricServerEnabled(): Promise<boolean> {
  try {
    return (await getBiometricStatus()).enabled;
  } catch {
    return false;
  }
}

/** Prompt Face ID / fingerprint and clear the PIN gate on success. */
export async function unlockWithBiometric(): Promise<boolean> {
  if (!isBiometricUnlockSupported()) return false;
  try {
    const { challenge, credential_ids } = await startBiometricUnlock();
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: base64urlToBytes(challenge),
        allowCredentials: credential_ids.map((id) => ({
          type: "public-key" as const,
          id: base64urlToBytes(id),
        })),
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return false;
    const resp = assertion.response as AuthenticatorAssertionResponse;

    const result = await finishBiometricUnlock({
      credentialId: bufferToBase64url(assertion.rawId),
      challenge,
      authenticatorData: bufferToBase64url(resp.authenticatorData),
      clientDataJSON: bufferToBase64url(resp.clientDataJSON),
      signature: bufferToBase64url(resp.signature),
    });
    return result.pin_verified === true;
  } catch {
    return false;
  }
}
