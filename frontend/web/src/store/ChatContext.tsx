import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCachedSession } from "@/api/auth";
import { useSessionStore } from "@/store/zustand/sessionStore";
import { fetchPublicProfile, updatePresence } from "@/api/profile";
import { primePublicProfile } from "@/api/publicProfileCache";
import { resolvePeer } from "@/utils/peerResolve";
import {
  listConversations,
  listMessages,
  sendMessageRest,
  setConversationHidden,
  apiDeleteMessage,
} from "@/api/chat";
import { mapApiConversation } from "@/realtime/useRealtimeChat";
import { apiMessageToUi } from "@/realtime/mapMessage";
import type { DemoGif, DemoSticker } from "@/data/mockMedia";
import { uploadFileResumable } from "@/media/resumableUpload";
import { encryptFile } from "@/security/mediaEncryption";
import { encryptForConversation } from "@/security/e2ee";
import { cacheBlobPersistent, cachePreviewUrl, cacheSignedUrl } from "@/media/mediaCache";
import { prepareMediaFile } from "@/media/compressMedia";
import type { SendOptions } from "@/components/chat/MessageComposer";
import { extractWaveformPeaks, formatVoiceDuration } from "@/voice/audioUtils";
import { useRealtimeChat } from "@/realtime/useRealtimeChat";
import { startDemoRealtime, scheduleDemoReceipts } from "@/realtime/demoRealtime";
import {
  notifyNewMessage,
  ensureNotificationPermission,
  registerWebPushSubscription,
  setGlobalNotificationPrefs,
} from "@/realtime/notifications";
import { getGlobalNotificationPrefs } from "@/api/notifications";
import { loadOfflineQueue } from "@/realtime/offlineQueue";
import {
  cacheConversationMessages,
  cacheConversationsList,
  hydrateOfflineChatAccess,
} from "@/offline/offlineSync";
import { useOfflineStore } from "@/store/zustand/offlineStore";
import { useRealtimeStore } from "@/store/zustand/realtimeStore";
import type { RealtimeConnectionState } from "@/realtime/types";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";
import { MOCK_CONVERSATIONS, MOCK_MESSAGES } from "@/data/mockChat";
import {
  loadChatVault,
  saveChatVault,
  type SerializedMessageMutations,
} from "@/security/chatVault";
import { useSettings } from "@/store/SettingsContext";
import type { Conversation, Message } from "@/types";
import {
  canSendMessages,
  createSavedMessagesConversation,
  SAVED_MESSAGES_ID,
  type ChatCategory,
  type ChatFolderId,
} from "@/utils/chatTypes";
import { replySenderLabel, replySnippet } from "@/utils/messageLayout";
import { canRecallMessage } from "@/utils/messageStatus";
import { filePreviewLabel, getFileCategory } from "@/utils/files";
import { extractFirstUrl, messageMatchesKeyword } from "@/utils/messageFormat";
import type { LinkPreview, PollData, QuizData } from "@/types";

interface MessageMutations {
  hiddenForMe: Set<string>;
  deletedForAll: Set<string>;
  recalled: Set<string>;
  edits: Record<string, string>;
  editedAt: Record<string, string>;
  ephemeralConsumed: Set<string>;
  reactionOverrides: Record<string, { reactions: Record<string, number>; myReaction?: string }>;
  pinnedByConversation: Record<string, string | null>;
  statusOverrides: Record<string, NonNullable<Message["status"]>>;
  clearedConversations: Set<string>;
}

interface ChatContextValue {
  conversations: Conversation[];
  visibleConversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  archivedConversations: Conversation[];
  hiddenConversations: Conversation[];
  savedConversation: Conversation | null;
  activeCategory: ChatCategory;
  setActiveCategory: (c: ChatCategory) => void;
  activeFolder: ChatFolderId | "all";
  setActiveFolder: (f: ChatFolderId | "all") => void;
  drafts: Record<string, string>;
  setDraft: (conversationId: string, text: string) => void;
  replyingTo: Message | null;
  cancelReply: () => void;
  selectConversation: (id: string) => void;
  search: string;
  setSearch: (v: string) => void;
  messagesForActive: Message[];
  messagesLoading: boolean;
  conversationsLoading: boolean;
  clearActiveConversation: () => void;
  sendMessage: (text: string, options?: SendOptions) => void;
  sendVoiceMessage: (
    durationSeconds: number,
    blobUrl: string,
    blob: Blob,
    options?: SendOptions,
  ) => void;
  sendFileMessage: (file: File, options?: SendOptions) => Promise<void>;
  sendPollMessage: (poll: PollData) => void;
  sendQuizMessage: (quiz: QuizData) => void;
  sendGifMessage: (gif: DemoGif) => void;
  sendStickerMessage: (sticker: DemoSticker) => void;
  scheduledCount: number;
  getUnreadTotal: () => number;
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  editingMessage: Message | null;
  copyMessage: (message: Message) => void;
  startEditMessage: (message: Message) => void;
  cancelEditMessage: () => void;
  saveEditMessage: (text: string) => void;
  recallMessage: (message: Message) => void;
  deleteMessage: (messageId: string, scope: "me" | "everyone") => void;
  deleteSelectedMessages: (scope: "me" | "everyone") => void;
  consumeEphemeralMessage: (messageId: string) => void;
  enterSelectionMode: (messageId?: string) => void;
  exitSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  handleMessageMenuAction: (
    message: Message,
    action: import("@/components/chat/MessageContextMenu").MessageMenuAction,
  ) => void;
  handleChatMenuAction: (conversation: Conversation, action: ChatMenuAction) => void;
  toggleSuperSecret: (conversationId: string) => void;
  messageFilter: string;
  setMessageFilter: (v: string) => void;
  pinnedMessage: Message | null;
  toggleReaction: (messageId: string, emoji: string) => void;
  pinMessage: (messageId: string) => void;
  unpinMessage: () => void;
  realtimeState: RealtimeConnectionState;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  markMessagesRead: () => void;
  markMessageDelivered: (messageId: string) => void;
  retryMessage: (messageId: string) => void;
  readReceiptsEnabled: boolean;
  offlineQueueCount: number;
  offlineMode: boolean;
  syncing: boolean;
  refreshConversations: () => Promise<Conversation[]>;
  refreshMessagesForConversation: (conversationId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  hasOlderMessages: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function cloneConversations(): Conversation[] {
  return ensureSavedInList(MOCK_CONVERSATIONS.map((c) => ({ ...c })));
}

function ensureSavedInList(convs: Conversation[]): Conversation[] {
  if (convs.some((c) => c.id === SAVED_MESSAGES_ID)) return convs;
  return [createSavedMessagesConversation(), ...convs];
}

function isConversationHidden(c: Conversation, legacyHiddenIds: Set<string>): boolean {
  return Boolean(c.hidden) || legacyHiddenIds.has(c.id);
}

function migrateLegacyHidden(convs: Conversation[], legacyHiddenIds: Set<string>): Conversation[] {
  if (legacyHiddenIds.size === 0) return convs;
  return convs.map((c) =>
    legacyHiddenIds.has(c.id) && !c.hidden ? { ...c, hidden: true } : c,
  );
}

function hiddenIdsFromConversations(convs: Conversation[]): string[] {
  return convs.filter((c) => c.hidden).map((c) => c.id);
}

function withTextKind(messages: Message[]): Message[] {
  return messages.map((m) => ({ ...m, kind: m.kind ?? "text" }));
}

const DEMO_PINNED_BY_CONV: Record<string, string | null> = { c1: "m3pin" };

function emptyMutations(): MessageMutations {
  return {
    hiddenForMe: new Set(),
    deletedForAll: new Set(),
    recalled: new Set(),
    edits: {},
    editedAt: {},
    ephemeralConsumed: new Set(),
    reactionOverrides: {},
    pinnedByConversation: { ...DEMO_PINNED_BY_CONV },
    statusOverrides: {},
    clearedConversations: new Set(),
  };
}

interface ScheduledEntry {
  id: string;
  conversationId: string;
  message: Message;
  preview: string;
  fireAt: number;
}

const SCHEDULE_LEAD_MS = 5000;

function serializeMutations(mut: MessageMutations): SerializedMessageMutations {
  return {
    hiddenForMe: [...mut.hiddenForMe],
    deletedForAll: [...mut.deletedForAll],
    recalled: [...mut.recalled],
    edits: { ...mut.edits },
    editedAt: { ...mut.editedAt },
    ephemeralConsumed: [...mut.ephemeralConsumed],
    reactionOverrides: { ...mut.reactionOverrides },
    pinnedByConversation: { ...mut.pinnedByConversation },
    statusOverrides: { ...mut.statusOverrides },
    clearedConversations: [...mut.clearedConversations],
  };
}

function deserializeMutations(data: SerializedMessageMutations): MessageMutations {
  return {
    hiddenForMe: new Set(data.hiddenForMe),
    deletedForAll: new Set(data.deletedForAll),
    recalled: new Set(data.recalled),
    edits: { ...data.edits },
    editedAt: { ...(data.editedAt ?? {}) },
    ephemeralConsumed: new Set(data.ephemeralConsumed),
    reactionOverrides: { ...(data.reactionOverrides ?? {}) },
    pinnedByConversation: { ...(data.pinnedByConversation ?? {}) },
    statusOverrides: { ...(data.statusOverrides ?? {}) },
    clearedConversations: new Set(data.clearedConversations ?? []),
  };
}

function extractMentions(text: string): string[] {
  const found = text.match(/@([a-zA-Z0-9_]{2,32})/g);
  if (!found) return [];
  return [...new Set(found.map((m) => m.slice(1)))];
}

function extractHashtags(text: string): string[] {
  const found = text.match(/#([a-zA-Z0-9_]{2,48})/g);
  if (!found) return [];
  return [...new Set(found.map((m) => m.slice(1)))];
}

function mockLinkPreview(url: string): LinkPreview {
  return {
    url,
    siteName: "nexa.app",
    title: "Nexa — Secure messaging",
    description: "Private chat, calls, and channels — encrypted in transit and at rest.",
    imageUrl: "https://picsum.photos/seed/nexa/320/180",
  };
}

function applyMutations(
  messages: Message[],
  mut: MessageMutations,
  conversationId: string,
): Message[] {
  if (mut.clearedConversations.has(conversationId)) return [];
  const pinnedId = mut.pinnedByConversation[conversationId];
  return messages
    .filter(
      (m) =>
        !mut.hiddenForMe.has(m.id) &&
        !mut.ephemeralConsumed.has(m.id) &&
        !mut.deletedForAll.has(m.id),
    )
    .map((m) => {
      let next = { ...m };
      if (mut.recalled.has(m.id)) {
        return {
          ...next,
          kind: "text" as const,
          text: m.outgoing ? "You recalled this message" : "Message was recalled",
          recalled: true,
          voiceUrl: undefined,
          voiceDuration: undefined,
          fileUrl: undefined,
          fileName: undefined,
          fileMimeType: undefined,
          fileSize: undefined,
          fileCategory: undefined,
        };
      }
      const edited = mut.edits[m.id];
      if (edited !== undefined) {
        next = {
          ...next,
          text: edited,
          editedAt: mut.editedAt[m.id] ?? next.editedAt ?? "edited",
        };
      }
      const rx = mut.reactionOverrides[m.id];
      if (rx) {
        next = {
          ...next,
          reactions: { ...next.reactions, ...rx.reactions },
          myReaction: rx.myReaction,
        };
      }
      const statusOverride = mut.statusOverrides[m.id];
      if (statusOverride) next = { ...next, status: statusOverride };
      if (pinnedId === m.id) next = { ...next, pinned: true };
      else if (next.pinned && pinnedId !== m.id) next = { ...next, pinned: false };
      return next;
    });
}

function nowTime() {
  return new Date().toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  // Reactive userId from the zustand session store — NOT a one-shot
  // getCachedSession() snapshot (which could be stale/null on the first render
  // and never update, leaving `userId` undefined so the "#PIN" reveal effect
  // short-circuited until a lock/unlock forced a re-render). The store updates
  // only on real session changes (login/logout/rehydrate), so unlike
  // useSession() it does NOT refetch and re-render the whole provider on every
  // window focus — which was re-mounting/refreshing the chat. getCachedSession()
  // covers the very first render before the store is populated.
  const cachedSession = getCachedSession();
  const storeUserId = useSessionStore((s) => s.userId);
  const storeDemoMode = useSessionStore((s) => s.demoMode);
  const userId = storeUserId ?? cachedSession?.user.id;
  const liveChatEnabled = Boolean(
    userId && !(storeUserId ? storeDemoMode : cachedSession?.demoMode),
  );
  const [vaultReady, setVaultReady] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [apiMessages, setApiMessages] = useState<Record<string, Message[]>>({});
  // Always-current snapshot of apiMessages so callbacks can read it without
  // listing apiMessages as a dependency (keeps their identity stable).
  const apiMessagesRef = useRef<Record<string, Message[]>>(apiMessages);
  apiMessagesRef.current = apiMessages;
  const [conversations, setConversations] = useState<Conversation[]>(cloneConversations);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) return null;
    return MOCK_CONVERSATIONS[0]?.id ?? null;
  });
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ChatCategory>("all");
  const [activeFolder, setActiveFolder] = useState<ChatFolderId | "all">("all");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [drafts, setDraftsState] = useState<Record<string, string>>({});
  const [hiddenChatIds, setHiddenChatIds] = useState<Set<string>>(() => new Set());
  const [extraMessages, setExtraMessages] = useState<Record<string, Message[]>>({});
  const [mutations, setMutations] = useState<MessageMutations>(emptyMutations);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageFilter, setMessageFilter] = useState("");
  const [scheduledQueue, setScheduledQueue] = useState<ScheduledEntry[]>([]);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>(
    () => useRealtimeStore.getState().connectionState,
  );
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const patchMessageStatus = useCallback(
    (messageId: string, status: NonNullable<Message["status"]>) => {
    if (messageId.startsWith("*read-")) {
      const convId = messageId.slice(6);
      const markRead = (m: Message) => (m.outgoing ? { ...m, status: "read" as const } : m);
      setApiMessages((prev) => {
        const list = prev[convId];
        if (!list) return prev;
        return { ...prev, [convId]: list.map(markRead) };
      });
      setExtraMessages((prev) => {
        const list = prev[convId];
        if (!list) return prev;
        return { ...prev, [convId]: list.map(markRead) };
      });
      setMutations((prev) => {
        const overrides = { ...prev.statusOverrides };
        for (const m of [...(MOCK_MESSAGES[convId] ?? [])]) {
          if (m.outgoing) overrides[m.id] = "read";
        }
        return { ...prev, statusOverrides: overrides };
      });
      return;
    }
    setMutations((prev) => ({
      ...prev,
      statusOverrides: { ...prev.statusOverrides, [messageId]: status },
    }));
    setExtraMessages((prev) => {
      let changed = false;
      const next: Record<string, Message[]> = { ...prev };
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          changed = true;
          const copy = [...list];
          copy[idx] = { ...copy[idx], status };
          next[cid] = copy;
        }
      }
      return changed ? next : prev;
    });
    setApiMessages((prev) => {
      let changed = false;
      const next: Record<string, Message[]> = { ...prev };
      for (const [cid, list] of Object.entries(prev)) {
        const idx = list.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          changed = true;
          const copy = [...list];
          copy[idx] = { ...copy[idx], status };
          next[cid] = copy;
        }
      }
      return changed ? next : prev;
    });
    },
    [],
  );

  const onLiveConversations = useCallback((convs: Conversation[]) => {
    setLiveMode(true);
    const base = ensureSavedInList(convs.length ? convs.map((c) => ({ ...c })) : cloneConversations());
    let mutedIds: Set<string>;
    try {
      mutedIds = new Set(JSON.parse(localStorage.getItem("nexa-muted-chats") ?? "[]") as string[]);
    } catch {
      mutedIds = new Set();
    }
    setConversations((prev) => {
      // Preserve locally-cleared unread counts so opening a chat doesn't re-show badge
      // when the server sends stale counts before read receipts are processed.
      const locallyRead = new Set(prev.filter((c) => c.unread === 0).map((c) => c.id));
      // Preserve local-only mutations (pin, archive, hide, folder) that the server
      // doesn't track — without this, every reconnect wipes out user actions.
      const prevById = new Map(prev.map((c) => [c.id, c]));
      return base.map((c) => {
        const local = prevById.get(c.id);
        return {
          ...c,
          unread: locallyRead.has(c.id) ? 0 : c.unread,
          pinned: local?.pinned ?? c.pinned,
          archived: local?.archived ?? c.archived,
          hidden: local?.hidden ?? c.hidden,
          folderId: local?.folderId ?? c.folderId,
          muted: mutedIds.has(c.id) ? true : (local?.muted ?? false),
        };
      });
    });
    setActiveId((prev) => {
      // Keep the current conversation only if it exists in the server list.
      // If it's null or a stale mock ID, auto-select the first real conv on desktop.
      const inList = prev !== null && base.some((c) => c.id === prev);
      if (inList) return prev;
      const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
      if (isMobile) return null;
      return base.find((c) => c.id !== SAVED_MESSAGES_ID)?.id ?? null;
    });
  }, []);

  const onLiveMessages = useCallback((conversationId: string, messages: Message[]) => {
    setApiMessages((prev) => {
      // Merge with any messages already in state (e.g. arrived via WS while fetch was in-flight)
      const existing = prev[conversationId] ?? [];
      const byId = new Map(messages.map((m) => [m.id, m]));
      for (const m of existing) {
        if (!byId.has(m.id)) byId.set(m.id, m);
      }
      const merged = [...byId.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      return { ...prev, [conversationId]: merged };
    });
    if (userId) void cacheConversationMessages(userId, conversationId, messages);
  }, [userId]);

  const onLiveAppend = useCallback((conversationId: string, message: Message) => {
    setApiMessages((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] ?? []), message],
    }));
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: message.text.slice(0, 80), lastAt: message.sentAt, lastAtTs: Date.now() }
          : c,
      ),
    );
  }, []);

  const onLivePatch = useCallback((conversationId: string, clientMsgId: string, message: Message) => {
    setApiMessages((prev) => {
      const list = prev[conversationId] ?? [];
      const idx = list.findIndex((m) => m.id === `pending-${clientMsgId}`);
      if (idx < 0) return { ...prev, [conversationId]: [...list, message] };
      const next = [...list];
      next[idx] = message;
      return { ...prev, [conversationId]: next };
    });
  }, []);

  const onLiveDelete = useCallback((conversationId: string, messageId: string) => {
    setMutations((prev) => {
      const deletedForAll = new Set(prev.deletedForAll);
      deletedForAll.add(messageId);
      return { ...prev, deletedForAll };
    });
  }, []);

  const onConversationActivity = useCallback(
    (
      conversationId: string,
      patch: Partial<Pick<Conversation, "lastMessage" | "lastAt" | "unread" | "typing" | "online">>,
    ) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const onLiveTyping = useCallback(
    (convId: string, _userId: string, isTyping: boolean) => {
      onConversationActivity(convId, { typing: isTyping });
    },
    [onConversationActivity],
  );

  const onLivePresence = useCallback(
    (uid: string, isOnline: boolean) => {
      setConversations((prev) =>
        prev.map((c) => (c.peerUserId === uid ? { ...c, online: isOnline } : c)),
      );
    },
    [],
  );

  const {
    sendText: liveSendText,
    sendTyping: liveSendTyping,
    markRead: liveMarkRead,
    markDelivered: liveMarkDelivered,
  } = useRealtimeChat({
    enabled: liveChatEnabled,
    activeId,
    onConversations: onLiveConversations,
    onMessages: onLiveMessages,
    onAppendMessage: onLiveAppend,
    onPatchMessage: onLivePatch,
    onDeleteMessage: onLiveDelete,
    onMessageStatus: patchMessageStatus,
    onTyping: onLiveTyping,
    onPresence: onLivePresence,
    onConnectionState: setRealtimeState,
    onConversationActivity,
    readReceiptsEnabled: settings.readReceipts,
    appSettings: settings,
    currentUserId: userId,
    getConversation: useCallback((id: string) => conversations.find((c) => c.id === id), [conversations]),
  });

  // Resolve DM peer display names. DM conversations carry no title, so the API
  // mapping leaves the placeholder "Chat"; here we fetch each peer's public
  // profile (cached) and patch the real name + online state into the list.
  // Converges: once a name is filled, the conversation no longer matches the
  // `needsName` filter, so no further setState occurs (no render loop).
  useEffect(() => {
    if (!liveChatEnabled) return;
    const pending = conversations.filter(
      (c) => c.peerUserId && (!c.name || c.name === "Chat"),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    void Promise.all(
      pending.map(async (c) => {
        const peer = await resolvePeer(c.peerUserId as string);
        return peer
          ? { id: c.id, name: peer.name, username: peer.username, online: peer.online }
          : null;
      }),
    ).then((results) => {
      if (cancelled) return;
      const patches = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (patches.length === 0) return;
      const byId = new Map(patches.map((p) => [p.id, p]));
      setConversations((prev) =>
        prev.map((c) => {
          const patch = byId.get(c.id);
          return patch
            ? { ...c, name: patch.name, username: patch.username, online: patch.online }
            : c;
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [conversations, liveChatEnabled]);

  // Peers now get real-time presence.update over the WS: the gateway fans an
  // online/offline frame out to everyone subscribed to a shared conversation
  // (onLivePresence updates the sidebar dot for every chat with that peer). This
  // poll is the decay FALLBACK for the ACTIVE chat only: it covers a missed WS
  // frame and the last_seen TTL expiry (peer's tab crashed without a clean
  // close), so the indicator still settles to gray. Re-fetch on an interval and
  // on tab focus, and drive it through state.
  const activePeerId = useMemo(
    () => conversations.find((c) => c.id === activeId)?.peerUserId,
    [conversations, activeId],
  );
  useEffect(() => {
    if (!liveChatEnabled || !activePeerId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const p = await fetchPublicProfile(activePeerId);
        if (!cancelled) {
          // Push the FULL fresh profile into the shared cache so the dot AND the
          // "last seen" text use the same live data (is_online + last_seen_at),
          // then drive the conversation-list dot through state.
          primePublicProfile(activePeerId, p);
          onLivePresence(activePeerId, Boolean(p.is_online));
        }
      } catch {
        /* transient failure — keep the last known state */
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30_000);
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activePeerId, liveChatEnabled, onLivePresence]);

  // OWN presence heartbeat: the server treats a user as online only while a
  // heartbeat is fresh (90s TTL), so the app must beat ~every 60s while visible.
  // Without it nobody ever shows online (the dot never lit green). Going hidden /
  // closing the tab marks offline immediately; privacy (show_online_status) is
  // still enforced server-side, so an "appear offline" user stays invisible.
  useEffect(() => {
    if (!liveChatEnabled || !userId) return;
    const beat = (online: boolean) => {
      void updatePresence(online).catch(() => {});
    };
    beat(true);
    const interval = window.setInterval(() => {
      if (!document.hidden) beat(true);
    }, 60_000);
    const onVis = () => beat(!document.hidden);
    const onHide = () => beat(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      beat(false);
    };
  }, [liveChatEnabled, userId]);

  const sendTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      if (liveChatEnabled) {
        liveSendTyping(conversationId, isTyping);
        return;
      }
      onConversationActivity(conversationId, { typing: isTyping });
    },
    [liveChatEnabled, liveSendTyping, onConversationActivity],
  );

  useEffect(() => {
    if (!liveChatEnabled) {
      setLiveMode(false);
      return;
    }
    if (realtimeState === "connected") {
      setLiveMode(true);
    }
  }, [liveChatEnabled, realtimeState]);

  useEffect(() => {
    if (liveChatEnabled && vaultReady) return;
    if (!vaultReady) return;
    void ensureNotificationPermission();
    if (liveChatEnabled && settings.pushNotifications) {
      void registerWebPushSubscription();
      void getGlobalNotificationPrefs()
        .then(setGlobalNotificationPrefs)
        .catch(() => undefined);
    }
    const stop = startDemoRealtime({
      onConnectionState: setRealtimeState,
      onTyping: (convId, isTyping) => onConversationActivity(convId, { typing: isTyping }),
      onPresence: (convId, online) => onConversationActivity(convId, { online }),
      onMessageStatus: patchMessageStatus,
      onIncomingMessage: (convId, msg) => {
        setExtraMessages((prev) => ({
          ...prev,
          [convId]: [...(prev[convId] ?? []), msg],
        }));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  lastMessage: msg.text.slice(0, 80),
                  lastAt: msg.sentAt,
                  lastAtTs: Date.now(),
                  unread: convId === activeId ? 0 : (c.unread ?? 0) + 1,
                }
              : c,
          ),
        );
      },
      onNotify: (convId, title, body, silent) => {
        const conv = conversations.find((c) => c.id === convId);
        if (conv?.muted) return; // user has muted this conversation
        const name = conv?.name ?? title;
        notifyNewMessage(
          { title: name, body, conversationId: convId, silent, currentUserId: userId },
          settings,
        );
      },
    });
    return stop;
  }, [
    liveChatEnabled,
    vaultReady,
    onConversationActivity,
    patchMessageStatus,
    activeId,
  ]);

  useEffect(() => {
    useRealtimeStore.getState().setConnectionState(realtimeState);
  }, [realtimeState]);

  useEffect(() => {
    const tick = () => {
      const n = loadOfflineQueue().length;
      setOfflineQueueCount(n);
      useRealtimeStore.getState().setOfflineQueueCount(n);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [realtimeState]);

  useEffect(() => {
    if (!userId) {
      setVaultReady(true);
      return;
    }
    let cancelled = false;
    void loadChatVault(userId)
      .then((vault) => {
        if (cancelled || !vault) {
          setVaultReady(true);
          return;
        }
        const legacyHidden = new Set(vault.hiddenChatIds);
        const merged = migrateLegacyHidden(
          ensureSavedInList(vault.conversations.map((c) => ({ ...c }))),
          legacyHidden,
        );
        setConversations(merged);
        setExtraMessages(vault.extraMessages);
        setMutations((prev) => {
          const loaded = deserializeMutations(vault.mutations);
          const pins = { ...DEMO_PINNED_BY_CONV, ...loaded.pinnedByConversation };
          return { ...loaded, pinnedByConversation: pins };
        });
        setHiddenChatIds(new Set(hiddenIdsFromConversations(merged)));
        if (vault.activeId) {
          const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
          if (!isMobile) setActiveId(vault.activeId);
        }
        setVaultReady(true);
      })
      .catch(() => {
        if (!cancelled) setVaultReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !liveChatEnabled) return;
    let cancelled = false;
    void hydrateOfflineChatAccess(userId).then((cached) => {
      if (cancelled || !cached) return;
      setConversations((prev) => (prev.length ? prev : ensureSavedInList(cached.conversations)));
      setApiMessages((prev) => {
        const next = { ...prev };
        for (const [cid, msgs] of Object.entries(cached.messagesByConversation)) {
          if (next[cid] === undefined) next[cid] = msgs;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, liveChatEnabled, vaultReady]);

  useEffect(() => {
    if (!vaultReady || !userId) return;
    const timer = window.setTimeout(() => {
      void saveChatVault(userId, {
        version: 1,
        conversations,
        extraMessages,
        mutations: serializeMutations(mutations),
        hiddenChatIds: hiddenIdsFromConversations(conversations),
        activeId,
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    vaultReady,
    userId,
    conversations,
    extraMessages,
    mutations,
    hiddenChatIds,
    activeId,
  ]);


  const savedConversation = useMemo(() => {
    const found = conversations.find((c) => c.id === SAVED_MESSAGES_ID);
    return found ?? createSavedMessagesConversation();
  }, [conversations]);

  // Hard gate: never render ANY chat until the encrypted vault has loaded and
  // applied the per-chat `hidden` flag. Otherwise "make invisible" chats flash
  // visible for a frame between the first paint (mock/cache) and the vault/server
  // resolving their hidden state. No reveal is possible before vaultReady anyway.
  const visibleConversations = useMemo(
    () =>
      !vaultReady
        ? []
        : conversations.filter((c) => {
            if (c.id === SAVED_MESSAGES_ID) return false;
            if (isConversationHidden(c, hiddenChatIds)) return false;
            if (c.blocked) return false;
            if (c.contactRemoved) return false;
            if (c.archived) return false;
            return true;
          }),
    [conversations, hiddenChatIds, vaultReady],
  );

  const archivedConversations = useMemo(
    () =>
      !vaultReady
        ? []
        : conversations.filter((c) => {
            if (c.id === SAVED_MESSAGES_ID) return false;
            if (isConversationHidden(c, hiddenChatIds)) return false;
            if (c.blocked || c.contactRemoved) return false;
            return Boolean(c.archived);
          }),
    [conversations, hiddenChatIds, vaultReady],
  );

  const hiddenConversations = useMemo(
    () =>
      !vaultReady
        ? []
        : conversations.filter((c) => {
            if (c.id === SAVED_MESSAGES_ID) return false;
            if (!isConversationHidden(c, hiddenChatIds)) return false;
            if (c.blocked || c.contactRemoved) return false;
            return true;
          }),
    [conversations, hiddenChatIds, vaultReady],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    setEditingMessage(null);
    setReplyingTo(null);
    setMessageFilter("");
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    );
  }, []);

  const clearActiveConversation = useCallback(() => {
    setActiveId(null);
    setEditingMessage(null);
    setReplyingTo(null);
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const cancelReply = useCallback(() => setReplyingTo(null), []);

  const setDraft = useCallback((conversationId: string, text: string) => {
    setDraftsState((prev) => {
      if (!text) {
        if (!(conversationId in prev)) return prev;
        const { [conversationId]: _, ...rest } = prev;
        return rest;
      }
      if (prev[conversationId] === text) return prev;
      return { ...prev, [conversationId]: text };
    });
  }, []);

  const messagesLoading = Boolean(
    liveChatEnabled && activeId && apiMessages[activeId] === undefined,
  );

  const conversationsLoading = Boolean(
    // Show the skeleton (not an empty list) while the vault is still resolving
    // hidden state — the list is intentionally gated to [] until vaultReady.
    !vaultReady ||
      (liveChatEnabled &&
        realtimeState === "reconnecting" &&
        !liveMode &&
        conversations.length === 0),
  );

  const offlineMode = useOfflineStore((s) => s.offlineMode);
  const syncing = useOfflineStore((s) => s.syncing);

  const rawMessagesForActive = useMemo(() => {
    if (!activeId) return [];
    let msgs: Message[];
    if (liveChatEnabled) {
      if (apiMessages[activeId] !== undefined) {
        msgs = applyMutations(withTextKind(apiMessages[activeId]), mutations, activeId);
      } else if (messagesLoading && !offlineMode) {
        return [];
      } else {
        const base = withTextKind(MOCK_MESSAGES[activeId] ?? []);
        const extra = extraMessages[activeId] ?? [];
        msgs = applyMutations([...base, ...extra], mutations, activeId);
      }
    } else {
      const base = withTextKind(MOCK_MESSAGES[activeId] ?? []);
      const extra = extraMessages[activeId] ?? [];
      msgs = applyMutations([...base, ...extra], mutations, activeId);
    }
    // Resolve replyToId → replyTo for messages that have a server-side reply reference
    const byId = new Map(msgs.map((m) => [m.id, m]));
    return msgs.map((m) => {
      if (!m.replyToId || m.replyTo) return m;
      const replied = byId.get(m.replyToId);
      if (!replied) return m;
      return {
        ...m,
        replyTo: {
          id: replied.id,
          text: replySnippet(replied, "Peer"),
          senderLabel: replySenderLabel(replied, "Peer"),
        },
      };
    });
  }, [activeId, apiMessages, extraMessages, liveChatEnabled, messagesLoading, mutations]);

  const messagesForActive = useMemo(() => {
    const q = messageFilter.trim();
    if (!q) return rawMessagesForActive;
    return rawMessagesForActive.filter((m) => messageMatchesKeyword(m.text, q));
  }, [rawMessagesForActive, messageFilter]);

  const pinnedMessage = useMemo(() => {
    if (!activeId) return null;
    const pinnedId = mutations.pinnedByConversation[activeId];
    if (pinnedId) {
      return rawMessagesForActive.find((m) => m.id === pinnedId) ?? null;
    }
    return rawMessagesForActive.find((m) => m.pinned) ?? null;
  }, [activeId, rawMessagesForActive, mutations.pinnedByConversation]);

  const appendMessage = useCallback(
    (msg: Message, preview: string, convId?: string) => {
      const cid = convId ?? activeId;
      if (!cid) return;
      setExtraMessages((prev) => ({
        ...prev,
        [cid]: [...(prev[cid] ?? []), msg],
      }));
      if (liveChatEnabled) {
        setApiMessages((prev) => ({
          ...prev,
          [cid]: [...(prev[cid] ?? []), msg],
        }));
      }
      if (cid === activeId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === cid ? { ...c, lastMessage: preview, lastAt: msg.sentAt, lastAtTs: Date.now(), unread: 0 } : c,
          ),
        );
      }
    },
    [activeId, liveChatEnabled],
  );

  const flushScheduledEntry = useCallback(
    (entry: ScheduledEntry) => {
      appendMessage(entry.message, entry.preview, entry.conversationId);
      if (!entry.message.scheduledAt) {
        scheduleDemoReceipts(entry.message.id, patchMessageStatus);
      }
    },
    [appendMessage, patchMessageStatus],
  );

  useEffect(() => {
    if (scheduledQueue.length === 0) return;
    const tick = () => {
      const now = Date.now();
      const due = scheduledQueue.filter((e) => e.fireAt <= now);
      if (due.length === 0) return;
      due.forEach(flushScheduledEntry);
      const dueIds = new Set(due.map((e) => e.id));
      setScheduledQueue((prev) => prev.filter((e) => !dueIds.has(e.id)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [scheduledQueue, flushScheduledEntry]);

  const patchOptimisticMessage = useCallback(
    (pendingId: string, patch: Partial<Message>) => {
      if (!activeId) return;
      const updater = (list: Message[]) =>
        list.map((m) => (m.id === pendingId ? { ...m, ...patch } : m));
      setExtraMessages((prev) => {
        const list = prev[activeId];
        if (!list?.some((m) => m.id === pendingId)) return prev;
        return { ...prev, [activeId]: updater(list) };
      });
      setApiMessages((prev) => {
        const list = prev[activeId];
        if (!list?.some((m) => m.id === pendingId)) return prev;
        return { ...prev, [activeId]: updater(list) };
      });
    },
    [activeId],
  );

  const sendMessage = useCallback(
    (text: string, options?: SendOptions) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // Saved Messages is a client-side self-chat with no backend conversation —
      // routing it through the live socket fails with "Not sent". Store it locally
      // (persists in the encrypted vault via extraMessages) and mark it delivered.
      const isSaved = activeId === SAVED_MESSAGES_ID;
      if (liveChatEnabled && !isSaved) {
        liveSendText(activeId, trimmed, options?.replyTo?.id);
        setReplyingTo(null);
        return;
      }
      const preview = options?.ephemeral ? "Disappearing message" : trimmed;
      const peer = activeConversation?.name ?? "Peer";
      const reply = options?.replyTo;
      const url = extractFirstUrl(trimmed);
      const sentAt = options?.scheduledAt
        ? new Date(options.scheduledAt).toLocaleTimeString("default", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : nowTime();
      const msgId = `local-${Date.now()}`;
      const draft: Message = {
        id: msgId,
        conversationId: activeId,
        kind: "text",
        text: trimmed,
        sentAt,
        outgoing: true,
        status: isSaved ? "sent" : "sending",
        ephemeral: options?.ephemeral,
        silent: options?.silent,
        scheduledAt: options?.scheduledAt,
        secureMode: activeConversation.isSuperSecret ? true : undefined,
        linkPreview: url ? mockLinkPreview(url) : undefined,
        mentions: extractMentions(trimmed),
        hashtags: extractHashtags(trimmed),
        replyTo: reply
          ? {
              id: reply.id,
              text: replySnippet(reply, peer),
              senderLabel: replySenderLabel(reply, peer),
            }
          : undefined,
      };
      const fireAt = options?.scheduledAt ? new Date(options.scheduledAt).getTime() : 0;
      if (fireAt > Date.now() + SCHEDULE_LEAD_MS) {
        setScheduledQueue((prev) => [
          ...prev,
          { id: msgId, conversationId: activeId, message: draft, preview, fireAt },
        ]);
      } else {
        appendMessage(draft, preview);
        if (!options?.scheduledAt && !isSaved) {
          scheduleDemoReceipts(msgId, patchMessageStatus);
        }
      }
      setReplyingTo(null);
    },
    [activeId, activeConversation, appendMessage, liveChatEnabled, liveSendText, patchMessageStatus],
  );

  const sendPollMessage = useCallback(
    (poll: PollData) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      const msgId = `poll-${Date.now()}`;
      appendMessage(
        {
          id: msgId,
          conversationId: activeId,
          kind: "poll",
          text: `Poll: ${poll.question}`,
          sentAt: nowTime(),
          outgoing: true,
          status: "sending",
          poll,
        },
        `Poll: ${poll.question}`,
      );
      scheduleDemoReceipts(msgId, patchMessageStatus);
    },
    [activeId, activeConversation, appendMessage, patchMessageStatus],
  );

  const sendGifMessage = useCallback(
    (gif: DemoGif) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      const msgId = `gif-${Date.now()}`;
      appendMessage(
        {
          id: msgId,
          conversationId: activeId,
          kind: "gif",
          text: gif.title,
          sentAt: nowTime(),
          outgoing: true,
          status: "sending",
          previewUrl: gif.previewUrl,
          fileUrl: gif.previewUrl,
          fileCategory: "image",
        },
        `GIF: ${gif.title}`,
      );
      scheduleDemoReceipts(msgId, patchMessageStatus);
    },
    [activeId, activeConversation, appendMessage, patchMessageStatus],
  );

  const sendStickerMessage = useCallback(
    (sticker: DemoSticker) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      const msgId = `sticker-${Date.now()}`;
      appendMessage(
        {
          id: msgId,
          conversationId: activeId,
          kind: "sticker",
          text: sticker.label,
          sentAt: nowTime(),
          outgoing: true,
          status: "sending",
          previewUrl: sticker.imageUrl,
          fileUrl: sticker.imageUrl,
          fileCategory: "image",
        },
        sticker.label,
      );
      scheduleDemoReceipts(msgId, patchMessageStatus);
    },
    [activeId, activeConversation, appendMessage, patchMessageStatus],
  );

  const sendQuizMessage = useCallback(
    (quiz: QuizData) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      const msgId = `quiz-${Date.now()}`;
      appendMessage(
        {
          id: msgId,
          conversationId: activeId,
          kind: "quiz",
          text: `Quiz: ${quiz.question}`,
          sentAt: nowTime(),
          outgoing: true,
          status: "sending",
          quiz,
        },
        `Quiz: ${quiz.question}`,
      );
      scheduleDemoReceipts(msgId, patchMessageStatus);
    },
    [activeId, activeConversation, appendMessage, patchMessageStatus],
  );

  const sendVoiceMessage = useCallback(
    async (durationSeconds: number, blobUrl: string, blob: Blob, options?: SendOptions) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      if (activeConversation.isSecret) return;
      const ephemeral = Boolean(options?.ephemeral);
      const ss = String(durationSeconds % 60).padStart(2, "0");
      const label = formatVoiceDuration(durationSeconds);
      const pendingId = `voice-${Date.now()}`;
      const session = getCachedSession();
      // Saved Messages is a client-side self-chat with no backend conversation —
      // routing media through the REST API hits a non-existent "saved" conversation
      // (→ "Not sent"). Keep it local (cached blob), exactly like the text path.
      const isSaved = activeId === SAVED_MESSAGES_ID;
      const useApi = Boolean(session?.user?.id && !session?.demoMode && liveChatEnabled) && !isSaved;

      let peaks: number[] | undefined;
      if (blob.size > 0) {
        peaks = await extractWaveformPeaks(blob, 28);
      }

      appendMessage(
        {
          id: pendingId,
          conversationId: activeId,
          kind: "voice",
          text: label,
          sentAt: nowTime(),
          outgoing: true,
          status: useApi ? "sending" : "sent",
          voiceDuration: durationSeconds,
          voiceUrl: blobUrl || undefined,
          voiceWaveform: peaks,
          ephemeral,
          secureMode: activeConversation.isSuperSecret ? true : undefined,
        },
        ephemeral ? "Disappearing voice" : "Voice message",
      );

      if (blob.size > 0) {
        void cacheBlobPersistent(`msg:${pendingId}`, blob);
      }

      if (!useApi || !blob.size) return;

      try {
        const plainFile = new File([blob], `voice-${pendingId}.webm`, {
          type: blob.type || "audio/webm",
        });
        const voiceBodyText = `Voice ${durationSeconds}s`;
        const myUserId = getCachedSession()?.user?.id ?? "";
        const convPeerOrMembers = activeConversation.isGroup
          ? (activeConversation.memberIds ?? [])
          : (activeConversation.peerUserId ?? "");

        // Try to determine if we can encrypt (peer public key available) by running
        // a quick encryption dry-run; if it fails we upload plaintext.
        let fileToUpload: File = plainFile;
        let mediaKey: string | undefined;
        let e2eeEnvelope: Record<string, unknown> | undefined;
        try {
          const encrypted = await encryptFile(plainFile);
          fileToUpload = encrypted.encryptedFile;
          mediaKey = encrypted.keyB64;
          const payload = JSON.stringify({ body: voiceBodyText, media_key: mediaKey });
          const env = await encryptForConversation(
            payload,
            activeId,
            convPeerOrMembers,
            Boolean(activeConversation.isGroup),
            myUserId,
          );
          if (env) e2eeEnvelope = env as unknown as Record<string, unknown>;
          else { fileToUpload = plainFile; mediaKey = undefined; } // no peer key → upload plain
        } catch {
          fileToUpload = plainFile; mediaKey = undefined;
        }

        const uploaded = await uploadFileResumable(fileToUpload);
        cacheSignedUrl(uploaded.media_id, uploaded.stream_url, 300);

        const clientMsgId = crypto.randomUUID().replace(/-/g, "");
        const sent = await sendMessageRest(activeId, {
          client_msg_id: clientMsgId,
          body: voiceBodyText,
          content_type: "voice",
          media_id: uploaded.media_id,
          ...(e2eeEnvelope ? { e2ee_envelope: e2eeEnvelope } : {}),
        });
        patchOptimisticMessage(pendingId, {
          id: sent.id,
          status: "sent",
          // Keep local blobUrl (unencrypted) for immediate playback; streamUrl is the encrypted server copy
          streamUrl: uploaded.stream_url,
          mediaId: uploaded.media_id,
          voiceWaveform: peaks,
          mediaKey,
        });
      } catch {
        patchMessageStatus(pendingId, "sent");
      }
    },
    [activeId, activeConversation, appendMessage, liveChatEnabled, patchMessageStatus, patchOptimisticMessage],
  );

  const sendFileMessage = useCallback(
    async (file: File, options?: SendOptions) => {
      if (!activeId || !activeConversation || !canSendMessages(activeConversation)) return;
      if (activeConversation.isSecret) return;
      const ephemeral = Boolean(options?.ephemeral);
      const videoNote = Boolean(options?.videoNote);
      const prepared = await prepareMediaFile(file);
      const mimeType = prepared.type || "application/octet-stream";
      const category = getFileCategory(mimeType);
      const preview = ephemeral
        ? "Disappearing file"
        : category === "image"
          ? "Photo"
          : category === "video"
            ? "Video"
            : category === "audio"
              ? "Audio"
              : file.name;
      const pendingId = `file-${Date.now()}`;
      const session = getCachedSession();
      // Saved Messages has no backend conversation — keep media local (cached blob)
      // instead of POSTing to a non-existent "saved" conversation (→ "Not sent").
      const isSaved = activeId === SAVED_MESSAGES_ID;
      const useMediaApi = Boolean(session?.user?.id && !session?.demoMode) && !isSaved;

      if (useMediaApi) {
        const kind = category === "video" || videoNote ? "video" : "file";
        const objectPreview =
          category === "video" || category === "image"
            ? URL.createObjectURL(prepared)
            : undefined;
        appendMessage(
          {
            id: pendingId,
            conversationId: activeId,
            kind,
            text: filePreviewLabel(prepared.name, prepared.size),
            sentAt: nowTime(),
            outgoing: true,
            status: "sending",
            fileName: prepared.name,
            fileMimeType: mimeType,
            fileSize: prepared.size,
            fileCategory: category,
            previewUrl: objectPreview ?? null,
            videoNote: videoNote || undefined,
            ephemeral,
          },
          preview,
        );
        try {
          const fileBodyText = filePreviewLabel(file.name, file.size);
          const myUserId2 = getCachedSession()?.user?.id ?? "";
          const convPeerOrMembers2 = activeConversation.isGroup
            ? (activeConversation.memberIds ?? [])
            : (activeConversation.peerUserId ?? "");

          let fileToUpload: File = prepared;
          let mediaKey2: string | undefined;
          let e2eeEnvelope2: Record<string, unknown> | undefined;
          try {
            const encrypted = await encryptFile(prepared);
            fileToUpload = encrypted.encryptedFile;
            mediaKey2 = encrypted.keyB64;
            const payload2 = JSON.stringify({ body: fileBodyText, media_key: mediaKey2 });
            const env2 = await encryptForConversation(
              payload2,
              activeId,
              convPeerOrMembers2,
              Boolean(activeConversation.isGroup),
              myUserId2,
            );
            if (env2) e2eeEnvelope2 = env2 as unknown as Record<string, unknown>;
            else { fileToUpload = prepared; mediaKey2 = undefined; }
          } catch {
            fileToUpload = prepared; mediaKey2 = undefined;
          }

          const uploaded = await uploadFileResumable(fileToUpload);
          cacheSignedUrl(uploaded.media_id, uploaded.stream_url, 300);
          // Server can't generate previews for encrypted content — skip caching
          if (uploaded.preview_url && !mediaKey2) {
            cachePreviewUrl(uploaded.media_id, uploaded.preview_url, 300);
          }

          const clientMsgId = crypto.randomUUID().replace(/-/g, "");
          const sent = await sendMessageRest(activeId, {
            client_msg_id: clientMsgId,
            body: fileBodyText,
            content_type: category === "image" ? "image" : category === "video" ? "video" : "file",
            media_id: uploaded.media_id,
            ...(e2eeEnvelope2 ? { e2ee_envelope: e2eeEnvelope2 } : {}),
          });
          if (objectPreview) URL.revokeObjectURL(objectPreview);
          patchOptimisticMessage(pendingId, {
            id: sent.id,
            status: "sent",
            mediaId: uploaded.media_id,
            // For encrypted uploads, server preview is meaningless — keep local objectPreview
            previewUrl: mediaKey2 ? undefined : (uploaded.preview_url ?? undefined),
            streamUrl: uploaded.stream_url,
            // Keep original mimeType — encrypted upload returns application/octet-stream
            fileMimeType: mediaKey2 ? mimeType : (uploaded.mime_type || mimeType),
            mediaKey: mediaKey2,
          });
        } catch {
          patchMessageStatus(pendingId, "sent");
        }
        return;
      }

      const fileUrl = await cacheBlobPersistent(`msg:${pendingId}`, prepared);
      const kind = category === "video" || videoNote ? "video" : "file";
      appendMessage(
        {
          id: pendingId,
          conversationId: activeId,
          kind,
          text: filePreviewLabel(prepared.name, prepared.size),
          sentAt: nowTime(),
          outgoing: true,
          status: "sent",
          fileName: prepared.name,
          fileUrl,
          fileMimeType: mimeType,
          fileSize: prepared.size,
          fileCategory: category,
          previewUrl: category === "video" || category === "image" ? fileUrl : null,
          streamUrl: category === "video" || videoNote ? fileUrl : null,
          videoNote: videoNote || undefined,
          videoDuration: videoNote ? 0 : undefined,
          ephemeral,
        },
        preview,
      );
    },
    [activeId, appendMessage, activeConversation, patchMessageStatus, patchOptimisticMessage],
  );

  const copyMessage = useCallback(
    (message: Message) => {
      if (activeConversation?.isSecret) return;
      if (message.kind !== "text" || message.recalled || message.ephemeral) return;
      void navigator.clipboard?.writeText(message.text);
    },
    [activeConversation?.isSecret],
  );

  const consumeEphemeralMessage = useCallback((messageId: string) => {
    setMutations((prev) => ({
      ...prev,
      ephemeralConsumed: new Set(prev.ephemeralConsumed).add(messageId),
    }));
  }, []);

  const startEditMessage = useCallback(
    (message: Message) => {
      if (activeConversation?.isSecret) return;
      if (message.kind !== "text" || message.recalled || !message.outgoing || message.ephemeral)
        return;
      setEditingMessage(message);
      setSelectionMode(false);
      setSelectedMessageIds(new Set());
    },
    [activeConversation?.isSecret],
  );

  const cancelEditMessage = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const saveEditMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!editingMessage || !trimmed) return;
      setMutations((prev) => ({
        ...prev,
        edits: { ...prev.edits, [editingMessage.id]: trimmed },
        editedAt: { ...prev.editedAt, [editingMessage.id]: nowTime() },
      }));
      setEditingMessage(null);
    },
    [editingMessage],
  );

  const recallMessage = useCallback((message: Message) => {
    if (!canRecallMessage(message)) return;
    setMutations((prev) => ({
      ...prev,
      recalled: new Set(prev.recalled).add(message.id),
    }));
  }, []);

  const deleteMessage = useCallback((messageId: string, scope: "me" | "everyone") => {
    setMutations((prev) => {
      const hiddenForMe = new Set(prev.hiddenForMe);
      const deletedForAll = new Set(prev.deletedForAll);
      if (scope === "me") hiddenForMe.add(messageId);
      else deletedForAll.add(messageId);
      return { ...prev, hiddenForMe, deletedForAll };
    });
    if (scope === "everyone") {
      void apiDeleteMessage(messageId, true).catch(() => {});
      // Optimistically clear the conversation's lastMessage (the WS event will confirm)
      if (activeId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, lastMessage: "" } : c)),
        );
      }
    }
  }, [activeId]);

  const toggleSuperSecret = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, isSuperSecret: !c.isSuperSecret } : c,
      ),
    );
  }, []);

  const handleChatMenuAction = useCallback(
    (conversation: Conversation, action: ChatMenuAction) => {
      switch (action.type) {
        case "hide":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, hidden: true } : c)),
          );
          setHiddenChatIds((prev) => new Set(prev).add(conversation.id));
          if (activeId === conversation.id) setActiveId(null);
          // Persist server-side so the chat stays hidden after re-login.
          if (liveChatEnabled) void setConversationHidden(conversation.id, true).catch(() => {});
          break;
        case "unhide":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, hidden: false } : c)),
          );
          setHiddenChatIds((prev) => {
            const next = new Set(prev);
            next.delete(conversation.id);
            return next;
          });
          if (liveChatEnabled) void setConversationHidden(conversation.id, false).catch(() => {});
          break;
        case "clear_chat":
          // Clears all message history but keeps the chat in the list.
          setExtraMessages((prev) => {
            const next = { ...prev };
            delete next[conversation.id];
            return next;
          });
          setMutations((prev) => ({
            ...prev,
            clearedConversations: new Set(prev.clearedConversations).add(conversation.id),
          }));
          break;
        case "delete":
          setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
          setApiMessages((prev) => {
            const next = { ...prev };
            delete next[conversation.id];
            return next;
          });
          setExtraMessages((prev) => {
            const next = { ...prev };
            delete next[conversation.id];
            return next;
          });
          setMutations((prev) => ({
            ...prev,
            clearedConversations: new Set(prev.clearedConversations).add(conversation.id),
          }));
          if (activeId === conversation.id) setActiveId(null);
          break;
        case "pin":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, pinned: true } : c)),
          );
          break;
        case "unpin":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, pinned: false } : c)),
          );
          break;
        case "archive":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, archived: true, pinned: false } : c)),
          );
          if (activeId === conversation.id) setActiveId(null);
          break;
        case "unarchive":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, archived: false } : c)),
          );
          break;
        case "set_folder":
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation.id ? { ...c, folderId: action.folderId } : c,
            ),
          );
          break;
        case "remove_contact":
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation.id ? { ...c, contactRemoved: true } : c,
            ),
          );
          if (activeId === conversation.id) setActiveId(null);
          break;
        case "block":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, blocked: true } : c)),
          );
          if (activeId === conversation.id) setActiveId(null);
          break;
        case "mute":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, muted: true } : c)),
          );
          try {
            const muted = JSON.parse(localStorage.getItem("nexa-muted-chats") ?? "[]") as string[];
            if (!muted.includes(conversation.id)) {
              localStorage.setItem("nexa-muted-chats", JSON.stringify([...muted, conversation.id]));
            }
          } catch { /* ignore */ }
          break;
        case "unmute":
          setConversations((prev) =>
            prev.map((c) => (c.id === conversation.id ? { ...c, muted: false } : c)),
          );
          try {
            const muted = JSON.parse(localStorage.getItem("nexa-muted-chats") ?? "[]") as string[];
            localStorage.setItem("nexa-muted-chats", JSON.stringify(muted.filter((id) => id !== conversation.id)));
          } catch { /* ignore */ }
          break;
        case "verify_safety":
          // Handled at ChatPage level — opens SafetyNumberModal
          break;
      }
    },
    [activeId],
  );

  const enterSelectionMode = useCallback((messageId?: string) => {
    setSelectionMode(true);
    setEditingMessage(null);
    setSelectedMessageIds(messageId ? new Set([messageId]) : new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, []);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const deleteSelectedMessages = useCallback(
    (scope: "me" | "everyone") => {
      [...selectedMessageIds].forEach((id) => deleteMessage(id, scope));
      exitSelectionMode();
    },
    [selectedMessageIds, deleteMessage, exitSelectionMode],
  );

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    setMutations((prev) => {
      const baseMsg = rawMessagesForActive.find((m) => m.id === messageId);
      const current = prev.reactionOverrides[messageId] ?? {
        reactions: { ...(baseMsg?.reactions ?? {}) },
        myReaction: baseMsg?.myReaction,
      };
      const reactions = { ...current.reactions };
      let myReaction = current.myReaction;
      if (myReaction === emoji) {
        reactions[emoji] = Math.max(0, (reactions[emoji] ?? 1) - 1);
        if (reactions[emoji] === 0) delete reactions[emoji];
        myReaction = undefined;
      } else {
        if (myReaction && reactions[myReaction]) {
          reactions[myReaction] = Math.max(0, reactions[myReaction] - 1);
          if (reactions[myReaction] === 0) delete reactions[myReaction];
        }
        reactions[emoji] = (reactions[emoji] ?? 0) + 1;
        myReaction = emoji;
      }
      return {
        ...prev,
        reactionOverrides: {
          ...prev.reactionOverrides,
          [messageId]: { reactions, myReaction },
        },
      };
    });
  }, [rawMessagesForActive]);

  const pinMessage = useCallback(
    (messageId: string) => {
      if (!activeId) return;
      setMutations((prev) => ({
        ...prev,
        pinnedByConversation: { ...prev.pinnedByConversation, [activeId]: messageId },
      }));
    },
    [activeId],
  );

  const unpinMessage = useCallback(() => {
    if (!activeId) return;
    setMutations((prev) => ({
      ...prev,
      pinnedByConversation: { ...prev.pinnedByConversation, [activeId]: null },
    }));
  }, [activeId]);

  const handleMessageMenuAction = useCallback(
    (
      message: Message,
      action: import("@/components/chat/MessageContextMenu").MessageMenuAction,
    ) => {
      switch (action.type) {
        case "copy":
          copyMessage(message);
          break;
        case "edit":
          startEditMessage(message);
          break;
        case "recall":
          recallMessage(message);
          break;
        case "delete":
          deleteMessage(message.id, action.scope);
          break;
        case "select":
          enterSelectionMode(message.id);
          break;
        case "reply":
          setReplyingTo(message);
          setEditingMessage(null);
          setSelectionMode(false);
          break;
        case "forward":
          if (!activeId || message.deleted) break;
          appendMessage(
            {
              id: `fwd-${Date.now()}`,
              conversationId: activeId,
              kind: message.kind ?? "text",
              text: message.text,
              sentAt: nowTime(),
              outgoing: true,
              status: "sent",
              forwardFrom: activeConversation?.name ?? "Chat",
              poll: message.poll,
              quiz: message.quiz,
            },
            `Forwarded: ${message.text.slice(0, 40)}`,
          );
          break;
        case "pin":
          pinMessage(message.id);
          break;
        case "unpin":
          unpinMessage();
          break;
        case "react":
          toggleReaction(message.id, action.emoji);
          break;
      }
    },
    [
      copyMessage,
      startEditMessage,
      recallMessage,
      deleteMessage,
      enterSelectionMode,
      activeId,
      activeConversation?.name,
      appendMessage,
      pinMessage,
      unpinMessage,
      toggleReaction,
    ],
  );

  const markMessagesRead = useCallback(() => {
    if (!activeId) return;
    if (settings.readReceipts) {
      if (liveChatEnabled) {
        liveMarkRead(activeId, rawMessagesForActive);
      } else {
        patchMessageStatus(`*read-${activeId}`, "read");
      }
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)),
    );
  }, [
    activeId,
    liveChatEnabled,
    liveMarkRead,
    rawMessagesForActive,
    patchMessageStatus,
    settings.readReceipts,
  ]);

  const retryMessage = useCallback(
    (messageId: string) => {
      if (!activeId || !liveChatEnabled) return;
      const list = rawMessagesForActive;
      const msg = list.find((m) => m.id === messageId);
      if (!msg?.text?.trim() || msg.status !== "failed") return;
      const text = msg.text.trim();
      setApiMessages((prev) => ({
        ...prev,
        [activeId]: (prev[activeId] ?? []).filter((m) => m.id !== messageId),
      }));
      liveSendText(activeId, text);
    },
    [activeId, liveChatEnabled, liveSendText, rawMessagesForActive],
  );

  const markMessageDelivered = useCallback(
    (messageId: string) => {
      if (liveChatEnabled) {
        liveMarkDelivered(messageId);
      } else {
        patchMessageStatus(messageId, "delivered");
      }
    },
    [liveChatEnabled, liveMarkDelivered, patchMessageStatus],
  );

  const getUnreadTotal = useCallback(
    () => visibleConversations.reduce((sum, c) => sum + c.unread, 0),
    [visibleConversations],
  );

  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!liveChatEnabled) return [];
    try {
      const raw = await listConversations();
      const mapped = raw.map(mapApiConversation);
      onLiveConversations(mapped);
      return mapped;
    } catch {
      return [];
    }
  }, [liveChatEnabled, onLiveConversations]);

  const refreshMessagesForConversation = useCallback(async (conversationId: string) => {
    if (!liveChatEnabled || !userId) return;
    try {
      const msgs = await listMessages(conversationId, { limit: 50 });
      const ui = msgs.map((m) => apiMessageToUi(m, userId));
      setApiMessages((prev) => ({ ...prev, [conversationId]: ui }));
    } catch {
      // On failure clear the undefined sentinel so messagesLoading becomes false
      // (prevents infinite loading spinner for mock / unreachable conversations).
      setApiMessages((prev) =>
        prev[conversationId] === undefined ? { ...prev, [conversationId]: [] } : prev,
      );
    }
  }, [liveChatEnabled, userId]);

  // Micro auto-refresh: keep data fresh without aggressive polling. Refresh the
  // conversation list + the open chat whenever the tab regains focus, the
  // network reconnects, or the tab becomes visible, plus a gentle background
  // tick. Skipped while hidden so it never burns battery in the background.
  useEffect(() => {
    if (!liveChatEnabled) return;
    let last = 0;
    const refreshNow = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - last < 3000) return; // coalesce bursts (focus+visible firing together)
      last = now;
      void refreshConversations();
      if (activeId) void refreshMessagesForConversation(activeId);
    };
    const onVis = () => {
      if (!document.hidden) refreshNow();
    };
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(refreshNow, 25_000);
    // Immediate fetch on mount so the list is never blank on first login
    // (WS may be slow to connect; REST fills the gap instantly)
    refreshNow();
    return () => {
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("online", refreshNow);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [liveChatEnabled, activeId, refreshConversations, refreshMessagesForConversation]);

  const [hasOlderByConv, setHasOlderByConv] = useState<Record<string, boolean>>({});
  const loadingOlderRef = useRef(false);

  const loadOlderMessages = useCallback(async () => {
    if (!activeId || !liveChatEnabled || !userId) return;
    if (loadingOlderRef.current) return;
    const msgs = apiMessagesRef.current[activeId] ?? [];
    if (msgs.length === 0) return;
    const LIMIT = 30;
    const oldestSeq = msgs.reduce((min, m) => (m.seq != null && m.seq < min ? m.seq : min), Infinity);
    if (oldestSeq <= 1 || oldestSeq === Infinity) {
      setHasOlderByConv((prev) => ({ ...prev, [activeId]: false }));
      return;
    }
    loadingOlderRef.current = true;
    try {
      const older = await listMessages(activeId, { before_seq: oldestSeq, limit: LIMIT });
      if (older.length === 0) {
        setHasOlderByConv((prev) => ({ ...prev, [activeId]: false }));
        return;
      }
      const uiOlder = older.map((m) => apiMessageToUi(m, userId));
      setApiMessages((prev) => {
        const current = prev[activeId] ?? [];
        const existingIds = new Set(current.map((m) => m.id));
        const fresh = uiOlder.filter((m) => !existingIds.has(m.id));
        return { ...prev, [activeId]: [...fresh, ...current] };
      });
      setHasOlderByConv((prev) => ({ ...prev, [activeId]: older.length === LIMIT }));
    } catch {
      // ignore
    } finally {
      loadingOlderRef.current = false;
    }
  }, [activeId, liveChatEnabled, userId]);

  const hasOlderMessages = Boolean(activeId && (hasOlderByConv[activeId] ?? liveChatEnabled));

  const value = useMemo(
    () => ({
      conversations,
      visibleConversations,
      activeId,
      activeConversation,
      archivedConversations,
      hiddenConversations,
      savedConversation,
      activeCategory,
      setActiveCategory,
      activeFolder,
      setActiveFolder,
      drafts,
      setDraft,
      replyingTo,
      cancelReply,
      selectConversation,
      search,
      setSearch,
      messagesForActive,
      messagesLoading,
      conversationsLoading,
      clearActiveConversation,
      sendMessage,
      sendVoiceMessage,
      sendFileMessage,
      sendPollMessage,
      sendQuizMessage,
      sendGifMessage,
      sendStickerMessage,
      scheduledCount: scheduledQueue.length,
      getUnreadTotal,
      selectionMode,
      selectedMessageIds,
      editingMessage,
      copyMessage,
      startEditMessage,
      cancelEditMessage,
      saveEditMessage,
      recallMessage,
      deleteMessage,
      deleteSelectedMessages,
      consumeEphemeralMessage,
      enterSelectionMode,
      exitSelectionMode,
      toggleMessageSelection,
      handleMessageMenuAction,
      handleChatMenuAction,
      toggleSuperSecret,
      messageFilter,
      setMessageFilter,
      pinnedMessage,
      toggleReaction,
      pinMessage,
      unpinMessage,
      realtimeState,
      sendTyping,
      markMessagesRead,
      markMessageDelivered,
      retryMessage,
      readReceiptsEnabled: settings.readReceipts,
      offlineQueueCount,
      offlineMode,
      syncing,
      refreshConversations,
      refreshMessagesForConversation,
      loadOlderMessages,
      hasOlderMessages,
    }),
    [
      conversations,
      visibleConversations,
      activeId,
      activeConversation,
      archivedConversations,
      hiddenConversations,
      savedConversation,
      activeCategory,
      activeFolder,
      drafts,
      setDraft,
      replyingTo,
      cancelReply,
      selectConversation,
      search,
      messagesForActive,
      messagesLoading,
      conversationsLoading,
      clearActiveConversation,
      sendMessage,
      sendVoiceMessage,
      sendFileMessage,
      sendPollMessage,
      sendQuizMessage,
      sendGifMessage,
      sendStickerMessage,
      scheduledQueue.length,
      getUnreadTotal,
      selectionMode,
      selectedMessageIds,
      editingMessage,
      copyMessage,
      startEditMessage,
      cancelEditMessage,
      saveEditMessage,
      recallMessage,
      deleteMessage,
      deleteSelectedMessages,
      consumeEphemeralMessage,
      enterSelectionMode,
      exitSelectionMode,
      toggleMessageSelection,
      handleMessageMenuAction,
      handleChatMenuAction,
      toggleSuperSecret,
      messageFilter,
      pinnedMessage,
      toggleReaction,
      pinMessage,
      unpinMessage,
      realtimeState,
      sendTyping,
      markMessagesRead,
      markMessageDelivered,
      retryMessage,
      settings.readReceipts,
      offlineQueueCount,
      offlineMode,
      syncing,
      refreshConversations,
      refreshMessagesForConversation,
      loadOlderMessages,
      hasOlderMessages,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

export function useChatOptional() {
  return useContext(ChatContext);
}
