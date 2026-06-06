import { listConversations, type ApiConversation } from "@/api/chat";
import { catchUpConversation } from "@/realtime/sync";
import { apiMessageToUi } from "@/realtime/mapMessage";
import { loadOfflineQueue } from "@/realtime/offlineQueue";
import type { Conversation, Message } from "@/types";
import { mergeConversationLists, mergeConversationMessages } from "./conflictResolution";
import {
  loadOfflineConversations,
  loadOfflineMessages,
  loadOfflineSyncMeta,
  saveOfflineConversations,
  saveOfflineMessages,
  saveOfflineSyncMeta,
} from "./chatOfflineCache";
import { flushOutboundQueueRest } from "./queuedSend";
import { useOfflineStore } from "@/store/zustand/offlineStore";

function mapConversation(c: ApiConversation): Conversation {
  return {
    id: c.id,
    uid: c.id.slice(0, 8),
    name: c.title ?? "Chat",
    lastMessage: c.last_message_preview ?? "",
    lastAt: "",
    unread: c.unread_count,
    online: false,
    isGroup: c.type !== "dm" && c.type !== "channel" && c.type !== "broadcast",
    peerUserId: c.peer_user_id ?? undefined,
    memberIds: c.member_ids?.length ? c.member_ids : undefined,
  };
}

/** Load encrypted cache for offline UI (no network). */
export async function hydrateOfflineChatAccess(
  userId: string,
): Promise<{ conversations: Conversation[]; messagesByConversation: Record<string, Message[]> } | null> {
  const conversations = await loadOfflineConversations(userId);
  if (!conversations?.length) return null;
  const messagesByConversation: Record<string, Message[]> = {};
  for (const c of conversations) {
    const msgs = await loadOfflineMessages(userId, c.id);
    if (msgs?.length) messagesByConversation[c.id] = msgs;
  }
  return { conversations, messagesByConversation };
}

export async function cacheConversationMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
): Promise<void> {
  await saveOfflineMessages(userId, conversationId, messages);
  const meta = await loadOfflineSyncMeta(userId);
  let maxSeq = meta.seqByConversation[conversationId] ?? 0;
  for (const m of messages) {
    if (typeof m.seq === "number") maxSeq = Math.max(maxSeq, m.seq);
  }
  meta.seqByConversation[conversationId] = maxSeq;
  meta.lastSyncAt = Date.now();
  await saveOfflineSyncMeta(userId, meta);
}

export async function cacheConversationsList(
  userId: string,
  conversations: Conversation[],
): Promise<void> {
  await saveOfflineConversations(userId, conversations);
  const meta = await loadOfflineSyncMeta(userId);
  meta.lastSyncAt = Date.now();
  await saveOfflineSyncMeta(userId, meta);
}

export interface ReconnectSyncCallbacks {
  onConversations: (convs: Conversation[]) => void;
  onMessages: (conversationId: string, messages: Message[]) => void;
  onResolvePending: (conversationId: string, clientMsgId: string, message: Message) => void;
}

/** Flush queue, fetch conversations, catch-up active + queued convs, merge conflicts. */
export async function runReconnectSync(
  userId: string,
  activeId: string | null,
  callbacks: ReconnectSyncCallbacks,
): Promise<void> {
  const store = useOfflineStore.getState();
  store.setSyncing(true);
  try {
    const flush = await flushOutboundQueueRest();
    for (const r of flush.resolved) {
      callbacks.onResolvePending(r.conversationId, r.clientMsgId, r.message);
    }

    let remoteConvs: Conversation[] = [];
    try {
      const apiConvs = await listConversations();
      remoteConvs = apiConvs.map(mapConversation);
    } catch {
      const cached = await loadOfflineConversations(userId);
      if (cached) remoteConvs = cached;
    }

    const cachedConvs = await loadOfflineConversations(userId);
    const mergedConvs = mergeConversationLists(cachedConvs ?? [], remoteConvs);
    callbacks.onConversations(mergedConvs);
    await saveOfflineConversations(userId, mergedConvs);

    const convIds = new Set<string>();
    if (activeId) convIds.add(activeId);
    for (const item of loadOfflineQueue()) convIds.add(item.conversationId);
    for (const c of mergedConvs.slice(0, 12)) convIds.add(c.id);

    for (const convId of convIds) {
      try {
        const synced = await catchUpConversation(convId);
        const ui = synced.map((m) => apiMessageToUi(m, userId));
        const cached = (await loadOfflineMessages(userId, convId)) ?? [];
        const merged = mergeConversationMessages(cached, ui);
        callbacks.onMessages(convId, merged);
        await cacheConversationMessages(userId, convId, merged);
      } catch {
        const cached = await loadOfflineMessages(userId, convId);
        if (cached) callbacks.onMessages(convId, cached);
      }
    }

    const meta = await loadOfflineSyncMeta(userId);
    meta.lastSyncAt = Date.now();
    await saveOfflineSyncMeta(userId, meta);
    store.setLastSyncAt(meta.lastSyncAt);
    store.setOfflineMode(false);
  } finally {
    store.setSyncing(false);
  }
}
