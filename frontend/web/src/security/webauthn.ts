/** WebAuthn / platform authenticator (native apps only; disabled on web). */

import { registerWebAuthnCredential } from "@/api/auth";
import { isWebAuthnEnabled } from "@/config/features";

export function isWebAuthnAvailable(): boolean {
  if (!isWebAuthnEnabled()) return false;
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function registerPlatformAuthenticator(
  userId: string,
  username: string,
): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "NEXA", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: username,
          displayName: username,
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!cred || !(cred.response instanceof AuthenticatorAttestationResponse)) {
      return false;
    }

    const credentialId = bufferToBase64url(cred.rawId);
    const publicKey = bufferToBase64url(cred.response.getPublicKey() ?? new ArrayBuffer(0));
    await registerWebAuthnCredential(credentialId, publicKey, "This device");
    return true;
  } catch {
    return false;
  }
}

export async function signInWithPlatformAuthenticator(
  email: string,
  challenge: string,
  allowedCredentialIds: string[],
): Promise<{ credentialId: string } | null> {
  if (!isWebAuthnAvailable()) return null;
  try {
    const challengeBytes = Uint8Array.from(atob(challenge.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const allowCredentials = allowedCredentialIds.map((id) => ({
      type: "public-key" as const,
      id: Uint8Array.from(atob(id.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
    }));

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        allowCredentials,
        userVerification: "preferred",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return null;
    return { credentialId: bufferToBase64url(assertion.rawId) };
  } catch {
    return null;
  }
}
