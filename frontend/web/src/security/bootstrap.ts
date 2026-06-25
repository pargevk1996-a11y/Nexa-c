import { refreshAccessToken } from "@/api/auth";
import { getOrCreateDeviceBaseKey } from "./deviceKey";
import { getCachedSession } from "./sessionCache";
import { initDeviceKeyPair } from "./e2ee";

export async function bootstrapSecurity(): Promise<void> {
  // Pre-warm the device base key from IndexedDB before any crypto operations.
  await getOrCreateDeviceBaseKey().catch(() => {});

  // Session lives in httpOnly cookies only (no localStorage). Establish it by
  // calling /auth/refresh on every page load — fast (one round-trip), and the
  // only way to get the session without reading client-side storage.
  await refreshAccessToken();

  // Init ECDH key pair and upload public key if the user is logged in.
  const session = getCachedSession();
  if (session?.user?.id) {
    await initDeviceKeyPair().catch(() => {});
  }
}
