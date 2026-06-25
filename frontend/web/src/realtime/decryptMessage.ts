import {
  getConversationKey,
  decryptMessage,
  decryptMessageForward,
  decryptMessageGroupV4,
  decryptMessageDR,
  decryptGroupV6,
  decryptMessagePQXDH,
} from "@/security/e2ee";
import type {
  E2eeEnvelope,
  E2eeEnvelopeV3,
  E2eeEnvelopeV4,
  E2eeEnvelopeV5,
  E2eeEnvelopeV6,
  E2eeEnvelopeV7,
} from "@/security/e2ee";
import { getCachedSession } from "@/security/sessionCache";
import { initUserSecurity } from "@/security/bootstrap";
import type { ApiMessage } from "@/api/chat";
import type { Conversation } from "@/types";

/**
 * Decrypt a single API message's E2EE envelope, returning a copy whose `body`
 * holds the plaintext (or the original message when there's nothing to decrypt).
 *
 * Used for BOTH live WS frames and the initial REST history load. The REST
 * loader returns encrypted envelopes; if they aren't decrypted here, opened
 * conversations show no/garbled messages until a manual page refresh. Awaits
 * `initUserSecurity()` so the local device key is guaranteed loaded before
 * decryption is attempted (keys aren't initialized after a no-reload login).
 *
 * Lives in its own module to avoid a circular import between useRealtimeChat,
 * ChatContext and offlineSync (all three need it).
 */
export async function decryptApiMessage(
  msg: ApiMessage,
  getConversation: ((id: string) => Conversation | undefined) | undefined,
): Promise<ApiMessage> {
  const env = msg.e2ee_envelope;
  if (!env || typeof env !== "object" || !("ciphertext" in env)) return msg;
  await initUserSecurity();
  const session = getCachedSession();
  if (!session?.user.id) return msg;
  const e = env as Record<string, unknown>;
  let plain: string | null = null;

  if (e.v === 7 && "mlkem_ct" in e) {
    plain = await decryptMessagePQXDH(e as unknown as E2eeEnvelopeV7).catch(() => null);
  } else if (e.v === 6 && "skId" in e) {
    const result = await decryptGroupV6(
      e as unknown as E2eeEnvelopeV6,
      msg.conversation_id,
      msg.sender_id,
    ).catch(() => null);
    plain = result?.plaintext ?? null;
  } else if (e.v === 5 && "dh_pub" in e) {
    const conv = getConversation?.(msg.conversation_id);
    const peerId = conv?.peerUserId ?? "";
    if (peerId) {
      plain = await decryptMessageDR(e as unknown as E2eeEnvelopeV5, msg.conversation_id, peerId).catch(() => null);
    }
  } else if (e.v === 4 && "recipients" in e) {
    plain = await decryptMessageGroupV4(e as unknown as E2eeEnvelopeV4, session.user.id).catch(() => null);
  } else if (e.v === 3 && "ephemeral_pub" in e) {
    plain = await decryptMessageForward(e as unknown as E2eeEnvelopeV3).catch(() => null);
  } else if (e.v === 2) {
    const conv = getConversation?.(msg.conversation_id);
    if (conv) {
      const key = await getConversationKey(
        conv.id,
        conv.isGroup ? (conv.memberIds ?? []) : (conv.peerUserId ?? ""),
        Boolean(conv.isGroup),
        session.user.id,
      ).catch(() => null);
      if (key) plain = await decryptMessage(e as unknown as E2eeEnvelope, key).catch(() => null);
    }
  }

  if (plain === null) return msg;
  let body = plain;
  let media_key: string | undefined;
  try {
    const parsed = JSON.parse(plain) as { body?: string; media_key?: string };
    if (parsed && typeof parsed.body === "string") {
      body = parsed.body;
      if (typeof parsed.media_key === "string") media_key = parsed.media_key;
    }
  } catch { /* plain string body */ }
  return { ...msg, body, ...(media_key ? { media_key } : {}) };
}
