import { refreshAccessToken } from "@/api/auth";
import { getOrCreateDeviceBaseKey } from "./deviceKey";
import { getCachedSession } from "./sessionCache";
import { initDeviceKeyPair } from "./e2ee";
import { initMlKemKeyPair } from "./pqxdh";
import { uploadMlKemPublicKey } from "@/api/e2ee";

export async function bootstrapSecurity(): Promise<void> {
  await getOrCreateDeviceBaseKey().catch(() => {});

  await refreshAccessToken();

  const session = getCachedSession();
  if (session?.user?.id) {
    await initDeviceKeyPair().catch(() => {});

    // Init ML-KEM-768 key pair and upload public key for PQXDH (#PQC)
    await initMlKemKeyPair()
      .then(async (pubB64) => {
        if (pubB64) await uploadMlKemPublicKey(pubB64).catch(() => {});
      })
      .catch(() => {});
  }
}
