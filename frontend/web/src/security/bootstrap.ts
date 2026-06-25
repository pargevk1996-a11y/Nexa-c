import { refreshAccessToken } from "@/api/auth";
import { getOrCreateDeviceBaseKey } from "./deviceKey";
import { getCachedSession } from "./sessionCache";
import { initDeviceKeyPair } from "./e2ee";
import { initMlKemKeyPair } from "./pqxdh";
import { uploadMlKemPublicKey } from "@/api/e2ee";

let _userSecurityReady = false;
let _initUserSecurityInFlight: Promise<void> | null = null;

/** True once the local E2EE key material is loaded and ready to decrypt messages. */
export function isUserSecurityReady(): boolean {
  return _userSecurityReady;
}

/**
 * Initialize the per-user E2EE key material (device ECDH key pair + ML-KEM-768)
 * and publish the ML-KEM public key. Idempotent and deduplicated: cheap to call
 * repeatedly. MUST run after a login that happens WITHOUT a full page reload
 * (SPA login / OAuth callback) — otherwise `_myKeyPair` stays null and every
 * incoming message decrypts to "[device key not initialized]" until the user
 * manually refreshes the page (the "messages don't load after login" bug).
 */
export async function initUserSecurity(): Promise<void> {
  if (_userSecurityReady) return;
  if (_initUserSecurityInFlight) return _initUserSecurityInFlight;
  const session = getCachedSession();
  if (!session?.user?.id) return;

  _initUserSecurityInFlight = (async () => {
    await initDeviceKeyPair().catch(() => {});
    // Init ML-KEM-768 key pair and upload public key for PQXDH (#PQC)
    await initMlKemKeyPair()
      .then(async (pubB64) => {
        if (pubB64) await uploadMlKemPublicKey(pubB64).catch(() => {});
      })
      .catch(() => {});
    _userSecurityReady = true;
    // Tell the app (ChatContext / realtime hook) keys are ready so it can
    // (re)load and decrypt the active conversation without a page refresh.
    try { window.dispatchEvent(new Event("securechat-security-ready")); } catch { /* SSR */ }
  })();
  try {
    await _initUserSecurityInFlight;
  } finally {
    _initUserSecurityInFlight = null;
  }
}

export async function bootstrapSecurity(): Promise<void> {
  await getOrCreateDeviceBaseKey().catch(() => {});

  await refreshAccessToken();

  await initUserSecurity();
}
