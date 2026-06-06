import type { Conversation, Message } from "@/types";
import { getEncryptedCache, setEncryptedCache } from "./encryptedCache";

const KEYS = {
  conversations: "offline:conversations",
  messages: (convId: string) => `offline:messages:${convId}`,
  meta: "offline:sync:meta",
} as const;

export interface OfflineSyncMeta {
  lastSyncAt: number | null;
  seqByConversation: Record<string, number>;
}

export interface OfflineChatSnapshot {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  meta: OfflineSyncMeta;
}

export async function loadOfflineSyncMeta(userId: string): Promise<OfflineSyncMeta> {
  const meta = await getEncryptedCache<OfflineSyncMeta>(userId, KEYS.meta);
  return meta ?? { lastSyncAt: null, seqByConversation: {} };
}

export async function saveOfflineSyncMeta(userId: string, meta: OfflineSyncMeta): Promise<void> {
  await setEncryptedCache(userId, KEYS.meta, meta);
}

export async function loadOfflineConversations(userId: string): Promise<Conversation[] | null> {
  return getEncryptedCache<Conversation[]>(userId, KEYS.conversations);
}

export async function saveOfflineConversations(
  userId: string,
  conversations: Conversation[],
): Promise<void> {
  await setEncryptedCache(userId, KEYS.conversations, conversations);
}

export async function loadOfflineMessages(
  userId: string,
  conversationId: string,
): Promise<Message[] | null> {
  return getEncryptedCache<Message[]>(userId, KEYS.messages(conversationId));
}

export async function saveOfflineMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
): Promise<void> {
  await setEncryptedCache(userId, KEYS.messages(conversationId), messages);
}

export async function loadOfflineSnapshot(userId: string): Promise<OfflineChatSnapshot | null> {
  const conversations = await loadOfflineConversations(userId);
  if (!conversations?.length) return null;
  const meta = await loadOfflineSyncMeta(userId);
  const messagesByConversation: Record<string, Message[]> = {};
  for (const c of conversations) {
    const msgs = await loadOfflineMessages(userId, c.id);
    if (msgs?.length) messagesByConversation[c.id] = msgs;
  }
  return { conversations, messagesByConversation, meta };
}

export async function persistOfflineSnapshot(
  userId: string,
  snapshot: OfflineChatSnapshot,
): Promise<void> {
  await saveOfflineConversations(userId, snapshot.conversations);
  await saveOfflineSyncMeta(userId, snapshot.meta);
  for (const [convId, messages] of Object.entries(snapshot.messagesByConversation)) {
    await saveOfflineMessages(userId, convId, messages);
  }
}
