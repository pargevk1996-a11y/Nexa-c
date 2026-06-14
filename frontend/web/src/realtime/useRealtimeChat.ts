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
import { getCachedPeer } from "@/utils/peerResolve";

export function mapApiConversation(c: ApiConversation): Conversation {
  // DMs carry no title — resolve the peer's display name (synchronously from the
  // process cache when already fetched; ChatContext fills the rest async).
  const cachedPeer = getCachedPeer(c.peer_user_id);
  return {
    id: c.id,
    uid: c.id.slice(0, 8),
    name: c.title ?? cachedPeer?.name ?? "Chat",
    username: cachedPeer?.username,
    lastMessage: c.last_message_preview ?? "",
    lastAt: "",
    unread: c.unread_count,
    online: cachedPeer?.online ?? false,
    isGroup: c.type !== "dm" && c.type !== "channel" && c.type !== "broadcast",
    peerUserId: c.peer_user_id ?? undefined,
    memberIds: c.member_ids?.length ? c.member_ids : undefined,
    isLocked: (c as any).is_locked ?? false,
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
  appSettings?: AppSettings;
  currentUserId?: string;
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
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Store event handler in a ref so the WS connection effect doesn't re-run when
  // callbacks change — avoids the infinite reconnect loop caused by unstable cb refs.
  const handleWsEventRef = useRef<(frame: WsFrame) => void>(() => undefined);

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
          unread: msg.conversation_id === activeIdRef.current ? 0 : 1,
        });
        if (!ui.outgoing && msg.conversation_id !== activeIdRef.current) {
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
            if (convId !== activeIdRef.current) return;
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
      onAppendMessage,
      onPatchMessage,
      onMessageStatus,
      onTyping,
      onPresence,
      onConversationActivity,
    ],
  );

  // Keep the ref in sync with the latest handler without triggering the WS effect.
  useEffect(() => {
    handleWsEventRef.current = handleWsEvent;
  }, [handleWsEvent]);

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
      onEvent: (frame) => handleWsEventRef.current(frame),
      onConnectionState,
      onConnected: async () => {
        const session = getCachedSession();
        const uid = session?.user.id;
        if (uid) {
          await runReconnectSync(uid, activeIdRef.current, {
            onConversations,
            onMessages,
            onResolvePending: onPatchMessage,
          });
        }
        try {
          const convs = await listConversations();
          const mapped = convs.map(mapApiConversation);
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
  }, [enabled, onConversations, onConnectionState, onMessages, onPatchMessage]);

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
      const uid = session.user.id;
      // Open at the LAST message: load the newest contiguous window (the last 30
      // messages, Sn..Sn-29). Older history is fetched lazily on scroll-up
      // (loadOlderMessages / startReached, also 30 at a time), so big
      // conversations open instantly and only pay for what the user actually
      // views. The full history stays in the DB — this is only the page size.
      const PAGE = 30;
      try {
        const { loadOfflineMessages } = await import("@/offline/chatOfflineCache");
        const cached = (await loadOfflineMessages(uid, activeId)) ?? [];

        const synced = await catchUpConversation(activeId);
        const newest = await listMessages(activeId, { limit: PAGE });
        const merged = new Map<string, ApiMessage>();
        for (const m of newest) merged.set(m.id, m);
        for (const m of synced) merged.set(m.id, m);
        const sorted = [...merged.values()].sort((a, b) => a.seq - b.seq);
        const ui = sorted.map((m) => apiMessageToUi(m, uid));

        // Only the newest window is loaded right now. Drop cached rows OLDER than
        // it so a stale/partial offline cache can't render a floating old message
        // with an empty gap above the newest page (the bug from the screen
        // recording). Older rows reload contiguously when the user scrolls up.
        // Keep pending/unsent (optimistic) rows so in-flight sends survive.
        const oldestLoadedSeq = sorted.length ? sorted[0].seq : 0;
        const cachedToKeep = cached.filter((m) => {
          if (m.id.startsWith("pending-")) return true;
          if (typeof m.seq !== "number") return true;
          return m.seq >= oldestLoadedSeq;
        });
        const resolved = mergeConversationMessages(cachedToKeep, ui);

        if (!cancelled) {
          for (const m of sorted) seqByMessageId.current.set(m.id, m.seq);
          onMessages(activeId, resolved);
          await cacheConversationMessages(uid, activeId, resolved);
        }
      } catch {
        const cached = await import("@/offline/chatOfflineCache").then((m) =>
          m.loadOfflineMessages(uid, activeId),
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
    (conversationId: string, text: string, replyToId?: string): string => {
      const session = getCachedSession();
      const clientMsgId = crypto.randomUUID().replace(/-/g, "");
      pendingRef.current.set(clientMsgId, conversationId);

      const wsOpen = wsRef.current?.isOpen;
      if (wsOpen) {
        wsRef.current?.sendMessage(conversationId, text, clientMsgId, replyToId);
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
        void sendMessageRest(conversationId, { client_msg_id: clientMsgId, body: text, reply_to_id: replyToId })
          .then((apiMsg) => {
            if (!session?.user.id) return;
            removeOutbound(clientMsgId);
            onPatchMessage(conversationId, clientMsgId, apiMessageToUi(apiMsg, session.user.id));
          })
          .catch(() => {
            onMessageStatus?.(`pending-${clientMsgId}`, "failed");
          });
      }
      // When WS is open, the ws-gateway handles persistence; no REST call needed.

      return clientMsgId;
    },
    [onAppendMessage, onPatchMessage, onMessageStatus],
  );

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    wsRef.current?.sendTyping(conversationId, isTyping);
  }, []);

  return { sendText, sendTyping, markRead, markDelivered, wsClient: wsRef };
}
