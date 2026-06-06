import { useCallback, useEffect, useRef } from "react";
import {
  listConversations,
  listMessages,
  markConversationRead,
  markMessageDelivered,
  sendMessageRest,
  type ApiConversation,
  type ApiMessage,
} from "@/api/chat";
import { getCachedSession } from "@/security/sessionCache";
import type { Conversation, Message } from "@/types";
import { apiMessageToUi } from "./mapMessage";
import { catchUpConversation, getLastSeq, setLastSeq } from "./sync";
import { RealtimeWsClient } from "./wsClient";
import type { RealtimeConnectionState, WsFrame } from "./types";
import { mergeConversationMessages } from "@/offline/conflictResolution";
import {
  cacheConversationMessages,
  cacheConversationsList,
  hydrateOfflineChatAccess,
  runReconnectSync,
} from "@/offline/offlineSync";
import { enqueueOutboundMessage } from "@/offline/queuedSend";
import { removeOutbound } from "./offlineQueue";
import { ensureNotificationPermission, notifyNewMessage } from "./notifications";
import type { AppSettings } from "@/store/settings";
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

export interface UseRealtimeChatOptions {
  enabled: boolean;
  activeId: string | null;
  onConversations: (convs: Conversation[]) => void;
  onMessages: (conversationId: string, messages: Message[]) => void;
  onAppendMessage: (conversationId: string, message: Message) => void;
  onPatchMessage: (conversationId: string, clientMsgId: string, message: Message) => void;
  onMessageStatus?: (messageId: string, status: NonNullable<Message["status"]>) => void;
  onTyping?: (conversationId: string, userId: string, isTyping: boolean) => void;
  onPresence?: (userId: string, isOnline: boolean) => void;
  onConnectionState?: (state: RealtimeConnectionState) => void;
  onConversationActivity?: (
    conversationId: string,
    patch: Partial<Pick<Conversation, "lastMessage" | "lastAt" | "unread" | "typing" | "online">>,
  ) => void;
  /** When false, read receipts are not sent to peers. */
  readReceiptsEnabled?: boolean;
}

export function useRealtimeChat({
  enabled,
  activeId,
  onConversations,
  onMessages,
  onAppendMessage,
  onPatchMessage,
  onMessageStatus,
  onTyping,
  onPresence,
  onConnectionState,
  onConversationActivity,
  readReceiptsEnabled = true,
  appSettings,
  currentUserId,
}: UseRealtimeChatOptions) {
  const wsRef = useRef<RealtimeWsClient | null>(null);
  const pendingRef = useRef<Map<string, string>>(new Map());
  const seqByMessageId = useRef<Map<string, number>>(new Map());
  const deliveredMarked = useRef<Set<string>>(new Set());

  const handleWsEvent = useCallback(
    (frame: WsFrame) => {
      const session = getCachedSession();
      if (!session?.user.id) return;

      if (frame.name === "message.new") {
        const msg = frame.payload.message as ApiMessage | undefined;
        if (!msg) return;
        setLastSeq(msg.conversation_id, Math.max(getLastSeq(msg.conversation_id), msg.seq));
        seqByMessageId.current.set(msg.id, msg.seq);
        const ui = apiMessageToUi(msg, session.user.id);
        onAppendMessage(msg.conversation_id, ui);
        onConversationActivity?.(msg.conversation_id, {
          lastMessage: ui.text.slice(0, 80),
          lastAt: ui.sentAt,
          unread: msg.conversation_id === activeId ? 0 : 1,
        });
        if (!ui.outgoing && msg.conversation_id !== activeId) {
          const convName =
            frame.payload.conversation_title as string | undefined;
          notifyNewMessage(
            {
              title: convName ?? "New message",
              body: ui.text,
              conversationId: msg.conversation_id,
              silent: ui.silent,
              currentUserId,
            },
            appSettings,
          );
        }
        return;
      }

      if (frame.name === "message.send.failed") {
        const clientId = frame.payload.client_msg_id as string | undefined;
        if (clientId) {
          onMessageStatus?.(`pending-${clientId}`, "failed");
        }
        return;
      }

      if (frame.name === "message.send.ok") {
        const msg = frame.payload.message as ApiMessage | undefined;
        const clientId = frame.payload.client_msg_id as string | undefined;
        if (msg && clientId) {
          removeOutbound(clientId);
          pendingRef.current.delete(clientId);
          seqByMessageId.current.set(msg.id, msg.seq);
          setLastSeq(msg.conversation_id, Math.max(getLastSeq(msg.conversation_id), msg.seq));
          const ui = apiMessageToUi(msg, session.user.id);
          onPatchMessage(msg.conversation_id, clientId, ui);
          onMessageStatus?.(ui.id, ui.status ?? "sent");
        }
      }

      if (frame.name === "message.edit") {
        const msg = frame.payload.message as ApiMessage | undefined;
        if (msg) {
          const ui = apiMessageToUi(msg, session.user.id);
          onPatchMessage(msg.conversation_id, msg.id, ui);
        }
      }

      if (frame.name === "typing.start" || frame.name === "typing.stop") {
        const convId = String(frame.payload.conversation_id ?? "");
        const userId = String(frame.payload.user_id ?? "");
        if (convId && userId && userId !== session.user.id) {
          onTyping?.(convId, userId, frame.name === "typing.start");
          onConversationActivity?.(convId, {
            typing: frame.name === "typing.start",
          });
        }
        return;
      }

      if (frame.name === "presence.update") {
        const userId = String(frame.payload.user_id ?? "");
        const isOnline = Boolean(frame.payload.is_online);
        if (userId) onPresence?.(userId, isOnline);
        return;
      }

      if (frame.name === "receipt.read") {
        const convId = String(frame.payload.conversation_id ?? frame.payload.conversation_id ?? "");
        const readerId = String(frame.payload.user_id ?? "");
        if (convId && readerId !== session.user.id) {
          onMessageStatus?.(`*read-${convId}`, "read");
        }
        return;
      }

      if (frame.name === "receipt.delivered") {
        const messageId = String(frame.payload.message_id ?? "");
        if (messageId) onMessageStatus?.(messageId, "delivered");
        return;
      }

      if (frame.name === "sync.required") {
        const convId = String(frame.payload.conversation_id ?? "");
        if (!convId) return;
        void (async () => {
          try {
            const synced = await catchUpConversation(convId);
            if (convId !== activeId) return;
            const historical = await listMessages(convId, { limit: 50 });
            const merged = new Map<string, ApiMessage>();
            for (const m of historical) merged.set(m.id, m);
            for (const m of synced) merged.set(m.id, m);
            const sorted = [...merged.values()].sort((a, b) => a.seq - b.seq);
            for (const m of sorted) seqByMessageId.current.set(m.id, m.seq);
            onMessages(
              convId,
              sorted.map((m) => apiMessageToUi(m, session.user.id)),
            );
          } catch {
            /* REST catch-up failed */
          }
        })();
        return;
      }
    },
    [
      activeId,
      onAppendMessage,
      onPatchMessage,
      onMessageStatus,
      onTyping,
      onPresence,
      onConversationActivity,
    ],
  );

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const client = wsRef.current;
      if (client && !client.isOpen) {
        client.connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      onConnectionState?.("offline");
      return;
    }

    void ensureNotificationPermission();

    const client = new RealtimeWsClient({
      onEvent: handleWsEvent,
      onConnectionState,
      onConnected: async () => {
        const session = getCachedSession();
        const uid = session?.user.id;
        if (uid) {
          await runReconnectSync(uid, activeId, {
            onConversations,
            onMessages,
            onResolvePending: onPatchMessage,
          });
        }
        try {
          const convs = await listConversations();
          const mapped = convs.map(mapConversation);
          onConversations(mapped);
          if (uid) await cacheConversationsList(uid, mapped);
          client.subscribe(convs.map((c) => c.id));
        } catch {
          if (uid) {
            const cached = await hydrateOfflineChatAccess(uid);
            if (cached) {
              onConversations(cached.conversations);
              for (const [cid, msgs] of Object.entries(cached.messagesByConversation)) {
                onMessages(cid, msgs);
              }
            }
          }
        }
      },
      onDisconnected: () => onConnectionState?.("reconnecting"),
    });
    wsRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [enabled, handleWsEvent, onConversations, onConnectionState, activeId, onMessages, onPatchMessage]);

  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => {
      useOfflineStore.getState().setOfflineMode(false);
      wsRef.current?.connect();
    };
    const onOffline = () => {
      useOfflineStore.getState().setOfflineMode(true);
      onConnectionState?.("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    useOfflineStore.getState().setOfflineMode(!navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [enabled, onConnectionState]);

  useEffect(() => {
    if (!enabled || !activeId) return;
    const session = getCachedSession();
    if (!session?.user.id) return;

    wsRef.current?.subscribe([activeId]);

    let cancelled = false;
    void (async () => {
      try {
        const synced = await catchUpConversation(activeId);
        const historical = await listMessages(activeId, { limit: 50 });
        const merged = new Map<string, ApiMessage>();
        for (const m of historical) merged.set(m.id, m);
        for (const m of synced) merged.set(m.id, m);
        const sorted = [...merged.values()].sort((a, b) => a.seq - b.seq);
        const ui = sorted.map((m) => apiMessageToUi(m, session.user.id));
        const { loadOfflineMessages } = await import("@/offline/chatOfflineCache");
        const cached = (await loadOfflineMessages(session.user.id, activeId)) ?? [];
        const resolved = mergeConversationMessages(cached, ui);
        if (!cancelled) {
          for (const m of sorted) seqByMessageId.current.set(m.id, m.seq);
          onMessages(activeId, resolved);
          await cacheConversationMessages(session.user.id, activeId, resolved);
        }
      } catch {
        const cached = await import("@/offline/chatOfflineCache").then((m) =>
          m.loadOfflineMessages(session.user.id, activeId),
        );
        if (!cancelled && cached?.length) onMessages(activeId, cached);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, activeId, onMessages]);

  const markRead = useCallback(
    (conversationId: string, messages: Message[]) => {
      if (!readReceiptsEnabled) return;
      const incoming = messages.filter((m) => !m.outgoing && m.status !== "read");
      if (incoming.length === 0) return;
      const maxSeq = Math.max(
        0,
        ...incoming.map((m) => seqByMessageId.current.get(m.id) ?? 0),
      );
      if (maxSeq <= 0) return;
      wsRef.current?.sendReadReceipt(conversationId, maxSeq);
      void markConversationRead(conversationId, maxSeq).catch(() => undefined);
      for (const m of incoming) {
        onMessageStatus?.(m.id, "read");
      }
    },
    [onMessageStatus, readReceiptsEnabled],
  );

  const markDelivered = useCallback(
    (messageId: string) => {
      if (deliveredMarked.current.has(messageId)) return;
      deliveredMarked.current.add(messageId);
      void markMessageDelivered(messageId).catch(() => undefined);
      onMessageStatus?.(messageId, "delivered");
    },
    [onMessageStatus],
  );

  const sendText = useCallback(
    (conversationId: string, text: string): string => {
      const session = getCachedSession();
      const clientMsgId = crypto.randomUUID().replace(/-/g, "");
      pendingRef.current.set(clientMsgId, conversationId);

      const wsOpen = wsRef.current?.isOpen;
      if (wsOpen) {
        wsRef.current?.sendMessage(conversationId, text, clientMsgId);
      } else {
        enqueueOutboundMessage({
          clientMsgId,
          conversationId,
          body: text,
          attempts: 0,
          createdAt: Date.now(),
        });
      }

      if (session?.user.id) {
        const optimistic: Message = {
          id: `pending-${clientMsgId}`,
          conversationId,
          kind: "text",
          text,
          sentAt: new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
          outgoing: true,
          status: "sending",
        };
        onAppendMessage(conversationId, optimistic);
      }

      if (!wsOpen && navigator.onLine) {
        void sendMessageRest(conversationId, { client_msg_id: clientMsgId, body: text })
          .then((apiMsg) => {
            if (!session?.user.id) return;
            removeOutbound(clientMsgId);
            onPatchMessage(conversationId, clientMsgId, apiMessageToUi(apiMsg, session.user.id));
          })
          .catch(() => {
            onMessageStatus?.(`pending-${clientMsgId}`, "failed");
          });
      } else if (!wsOpen && !navigator.onLine) {
        /* stays queued until reconnect */
      } else if (wsOpen) {
        void sendMessageRest(conversationId, { client_msg_id: clientMsgId, body: text }).catch(
          () => onMessageStatus?.(`pending-${clientMsgId}`, "failed"),
        );
      }

      return clientMsgId;
    },
    [onAppendMessage, onPatchMessage, onMessageStatus],
  );

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    wsRef.current?.sendTyping(conversationId, isTyping);
  }, []);

  return { sendText, sendTyping, markRead, markDelivered, wsClient: wsRef };
}
