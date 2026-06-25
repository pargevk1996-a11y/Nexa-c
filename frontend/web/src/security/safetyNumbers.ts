/**
 * Safety Numbers — a conversation fingerprint derived from both users' ECDH P-256 public keys.
 *
 * Algorithm (Signal-inspired):
 *   canonical  = sort_by_userId([ (userId1, pubKeyBytes1), (userId2, pubKeyBytes2) ])
 *   hash       = SHA-512( uid1_utf8 + key1_bytes + uid2_utf8 + key2_bytes )
 *   groups     = first 60 bytes → 12 chunks of 5 bytes → each chunk % 100000 → zero-pad to 5 digits
 *   display    = "DDDDD DDDDD DDDDD DDDDD DDDDD DDDDD\nDDDDD DDDDD DDDDD DDDDD DDDDD DDDDD"
 *
 * Both users derive the same number because input is sorted by userId.
 */

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function computeSafetyNumber(
  myUserId: string,
  myPubKeyB64: string,
  peerUserId: string,
  peerPubKeyB64: string,
): Promise<string> {
  const [uid1, key1, uid2, key2] =
    myUserId < peerUserId
      ? [myUserId, myPubKeyB64, peerUserId, peerPubKeyB64]
      : [peerUserId, peerPubKeyB64, myUserId, myPubKeyB64];

  const uid1Bytes = enc.encode(uid1);
  const key1Bytes = b64ToBytes(key1);
  const uid2Bytes = enc.encode(uid2);
  const key2Bytes = b64ToBytes(key2);

  const combined = new Uint8Array(
    uid1Bytes.length + key1Bytes.length + uid2Bytes.length + key2Bytes.length,
  );
  let offset = 0;
  for (const chunk of [uid1Bytes, key1Bytes, uid2Bytes, key2Bytes]) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const hashBuf = await crypto.subtle.digest("SHA-512", combined);
  const bytes = new Uint8Array(hashBuf);

  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    let val = 0;
    for (let j = 0; j < 5; j++) val = val * 256 + bytes[i * 5 + j];
    groups.push(String(val % 100000).padStart(5, "0"));
  }

  return groups.join(" ");
}

export function formatSafetyNumberRows(safetyNumber: string): [string, string] {
  const groups = safetyNumber.split(" ");
  return [groups.slice(0, 6).join(" "), groups.slice(6).join(" ")];
}
