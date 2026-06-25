import { apiFetch } from "./client";

export async function uploadPublicKey(ecdhPublicKey: string): Promise<void> {
  await apiFetch("/users/me/public-key", {
    method: "PUT",
    body: JSON.stringify({ ecdh_public_key: ecdhPublicKey }),
  });
}

export async function fetchPeerPublicKey(userId: string): Promise<string | null> {
  try {
    const data = await apiFetch<{ ecdh_public_key?: string | null }>(`/users/${userId}`);
    return data.ecdh_public_key ?? null;
  } catch {
    return null;
  }
}

export async function fetchKeyPackage(conversationId: string): Promise<{ ephemeral_pub: string; ciphertext: string } | null> {
  try {
    const data = await apiFetch<{ package: { ephemeral_pub: string; ciphertext: string } | null }>(
      `/conversations/${conversationId}/key-package`,
    );
    return data.package ?? null;
  } catch {
    return null;
  }
}

export async function putKeyPackages(
  conversationId: string,
  packages: { user_id: string; package: { ephemeral_pub: string; ciphertext: string } }[],
): Promise<void> {
  await apiFetch(`/conversations/${conversationId}/key-packages`, {
    method: "PUT",
    body: JSON.stringify({ packages }),
  });
}

export async function uploadSenderKeyDistribution(
  groupId: string,
  distributions: { userId: string; ephemeral_pub: string; key_ct: string }[],
): Promise<void> {
  try {
    await apiFetch(`/conversations/${groupId}/sender-key`, {
      method: "PUT",
      body: JSON.stringify({ distributions }),
    });
  } catch {
    // Best-effort; members will request re-distribution on next connect
  }
}

export async function fetchSenderKeyDistribution(
  groupId: string,
): Promise<{ sender_id: string; ephemeral_pub: string; key_ct: string }[]> {
  try {
    const data = await apiFetch<{
      distributions: { sender_id: string; ephemeral_pub: string; key_ct: string }[];
    }>(`/conversations/${groupId}/sender-key`);
    return data.distributions ?? [];
  } catch {
    return [];
  }
}
