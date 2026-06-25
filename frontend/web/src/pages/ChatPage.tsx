import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  focusChatComposer,
  focusChatSearchInput,
  useChatKeyboardShortcuts,
} from "@/hooks/useChatKeyboardShortcuts";
import { conversationMatchesSearch } from "@/utils/userSearch";
import { getCachedSession } from "@/api/auth";
import { acceptContactRequest, declineContactRequest, getContactStatus } from "@/api/contacts";
import { useCall } from "@/calls/CallProvider";
import { resolveDemoCallPeers } from "@/calls/demoCallPeers";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatLeftPanel } from "@/components/chat/ChatLeftPanel";
import { ResizableChatShell } from "@/components/chat/ResizableChatShell";
import { ProfilePanel } from "@/components/chat/ProfilePanel";
import { ScheduleModal } from "@/components/chat/ScheduleModal";
import { SafetyNumberModal } from "@/components/chat/SafetyNumberModal";

const ScheduleModalMemo = memo(ScheduleModal);
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageList } from "@/components/chat/MessageList";
import { MessageSelectionBar } from "@/components/chat/MessageSelectionBar";
import { IconChats } from "@/components/icons/Icons";
import { CreateSpaceModal } from "@/components/groups/CreateSpaceModal";
import { MessageSearchPanel } from "@/components/ai/MessageSearchPanel";
import { PinnedMessagesBar } from "@/components/chat/PinnedMessagesBar";
import { EnvironmentRibbon } from "@/components/layout/EnvironmentRibbon";
import { ChatTypingBar } from "@/components/chat/ChatTypingBar";
import { ChatDropZone } from "@/components/chat/ChatDropZone";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useChat } from "@/store/ChatContext";
import { canSendMessages } from "@/utils/chatTypes";
import type { CallType } from "@/types";

export function ChatPage() {
  const navigate = useNavigate();
  const session = getCachedSession();
  const call = useCall();
  const [profileOpen, setProfileOpen] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePendingText, setSchedulePendingText] = useState("");
  const [safetyNumberConv, setSafetyNumberConv] = useState<{ peerId: string; peerName: string } | null>(null);
  const [contactRequestId, setContactRequestId] = useState<string | null>(null);
  const [contactRequestBusy, setContactRequestBusy] = useState(false);
  const {
    visibleConversations,
    hiddenConversations,
    archivedConversations,
    savedConversation,
    activeId,
    selectConversation,
    refreshConversations,
    search,
    setSearch,
    activeCategory,
    setActiveCategory,
    activeFolder,
    setActiveFolder,
    replyingTo,
    cancelReply,
    messagesForActive,
    messagesLoading,
    conversationsLoading,
    clearActiveConversation,
    sendMessage,
    sendVoiceMessage,
    sendFileMessage,
    sendGifMessage,
    sendStickerMessage,
    selectionMode,
    selectedMessageIds,
    editingMessage,
    cancelEditMessage,
    saveEditMessage,
    exitSelectionMode,
    deleteSelectedMessages,
    toggleMessageSelection,
    handleMessageMenuAction,
    handleChatMenuAction,
    toggleSuperSecret,
    consumeEphemeralMessage,
    messageFilter,
    setMessageFilter,
    pinnedMessage,
    unpinMessage,
    toggleReaction,
    activeConversation: active,
    markMessagesRead,
    markMessageDelivered,
    retryMessage,
    readReceiptsEnabled,
    drafts,
    setDraft,
    refreshMessagesForConversation,
    loadOlderMessages,
    hasOlderMessages,
  } = useChat();

  useKeyboardInset(Boolean(activeId));


  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // On mobile, intercept the hardware back button while a chat is open so it
  // returns to the chat list instead of jumping to the previous route in history.
  const clearActiveRef = useRef(clearActiveConversation);
  useEffect(() => { clearActiveRef.current = clearActiveConversation; }, [clearActiveConversation]);
  useEffect(() => {
    if (!activeId || !isNarrow) return;
    // Push a dummy entry so the back button pops it (not a real route).
    window.history.pushState({ _chatGuard: true }, "");
    const onPop = () => { clearActiveRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeId, isNarrow]);

  const chatMainRef = useRef<HTMLElement>(null);

  const handleEscape = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    if (profileOpen) {
      setProfileOpen(false);
      return;
    }
    if (selectionMode) {
      exitSelectionMode();
      return;
    }
    if (replyingTo) {
      cancelReply();
      return;
    }
    if (editingMessage) {
      cancelEditMessage();
      return;
    }
    if (activeId && isNarrow) {
      clearActiveConversation();
    }
  }, [
    searchOpen,
    profileOpen,
    selectionMode,
    replyingTo,
    editingMessage,
    activeId,
    isNarrow,
    exitSelectionMode,
    cancelReply,
    cancelEditMessage,
    clearActiveConversation,
  ]);

  const handleFocusSearch = useCallback(() => {
    if (activeId) {
      setSearchOpen(true);
      requestAnimationFrame(() => focusChatSearchInput());
      return;
    }
    focusChatSearchInput();
  }, [activeId]);

  useChatKeyboardShortcuts(session != null, {
    onFocusSearch: handleFocusSearch,
    onFocusComposer: focusChatComposer,
    onOpenSettings: () => navigate("/app/settings"),
    onEscape: handleEscape,
    onToggleProfile: () => {
      if (!active) return;
      setProfileOpen((o) => !o);
    },
  });

  const [searchParams] = useSearchParams();
  const isSecret = Boolean(active?.isSecret);
  const isSuperSecret = Boolean(active?.isSuperSecret);
  const canPost = active ? canSendMessages(active) : true;

  function startCall(type: CallType) {
    if (!active || isSecret || active.isChannel) return;
    const meId = session?.user.id;
    let peerIds: string[];
    let participantLabels: Record<string, string> | undefined;
    if (session?.demoMode) {
      const resolved = resolveDemoCallPeers(active, meId);
      peerIds = resolved.peerIds;
      participantLabels = resolved.labels;
    } else {
      const rawIds = active.isGroup
        ? (active.memberIds ?? [])
        : active.peerUserId
          ? [active.peerUserId]
          : [];
      peerIds = meId ? rawIds.filter((id) => id !== meId) : rawIds;
    }
    if (!peerIds.length) {
      window.alert(
        active.isGroup
          ? "No group members available for a call."
          : "Start a direct chat with a registered user to place WebRTC calls.",
      );
      return;
    }
    void call.startCall({
      participantIds: peerIds,
      callType: type,
      displayName: active.name,
      conversationId: active.id,
      participantLabels,
    });
  }

  useEffect(() => {
    setProfileOpen(false);
    setSearchOpen(false);
    setContactRequestId(null);
  }, [activeId]);

  // Load contact request id for locked conversations so we can accept/decline inline
  useEffect(() => {
    if (!active?.isLocked || !active.peerUserId || session?.demoMode) return;
    void getContactStatus(active.peerUserId)
      .then((s) => { if (s.request_id) setContactRequestId(s.request_id); })
      .catch(() => {});
  }, [active?.isLocked, active?.peerUserId, session?.demoMode]);

  async function acceptLockedRequest() {
    if (!contactRequestId || !activeId) return;
    setContactRequestBusy(true);
    try {
      await acceptContactRequest(contactRequestId);
      await refreshConversations();
      await refreshMessagesForConversation(activeId);
    } catch {
      // ignore
    } finally {
      setContactRequestBusy(false);
    }
  }

  async function declineLockedRequest() {
    if (!contactRequestId) return;
    setContactRequestBusy(true);
    try {
      await declineContactRequest(contactRequestId);
      await refreshConversations();
      clearActiveConversation();
    } catch {
      // ignore
    } finally {
      setContactRequestBusy(false);
    }
  }

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null && q !== search) setSearch(q);
  }, [searchParams, search, setSearch]);

  useEffect(() => {
    const q = search.trim();
    if (!q || activeId) return;
    const match = visibleConversations.find((c) => conversationMatchesSearch(c, q));
    if (match) selectConversation(match.id);
  }, [search, activeId, visibleConversations, selectConversation]);

  const showDeleteSelectionForEveryone = useMemo(() => {
    if (selectedMessageIds.size === 0) return false;
    const selected = messagesForActive.filter((m) => selectedMessageIds.has(m.id));
    const hasIncoming = selected.some((m) => !m.outgoing);
    const hasOutgoing = selected.some((m) => m.outgoing);
    return hasOutgoing && !hasIncoming;
  }, [messagesForActive, selectedMessageIds]);

  const handleBackToList = useCallback(() => {
    clearActiveConversation();
  }, [clearActiveConversation]);

  const handleScheduleClose = useCallback(() => {
    setScheduleOpen(false);
    setSchedulePendingText("");
  }, []);

  const handleChatMenuActionWithSafety = useCallback(
    (conversation: Parameters<typeof handleChatMenuAction>[0], action: Parameters<typeof handleChatMenuAction>[1]) => {
      if (action.type === "verify_safety") {
        const peerId = conversation.peerUserId;
        if (!peerId) return;
        setSafetyNumberConv({ peerId, peerName: conversation.name });
        return;
      }
      handleChatMenuAction(conversation, action);
    },
    [handleChatMenuAction],
  );

  useEffect(() => {
    if (!session) navigate("/login", { replace: true });
  }, [session, navigate]);

  if (!session) return null;

  const shellClass = [
    "chat-shell--telegram",
    activeId && isNarrow ? "chat-shell--conversation-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="chat-page">
      <EnvironmentRibbon />
      <CreateSpaceModal
        open={createSpaceOpen}
        onClose={() => setCreateSpaceOpen(false)}
        onCreated={(id) => {
          selectConversation(id);
          setCreateSpaceOpen(false);
        }}
      />
      <ResizableChatShell
        className={shellClass}
        profileOpen={profileOpen}
        onProfileClose={() => setProfileOpen(false)}
        sidebar={
          <ChatLeftPanel
            loading={conversationsLoading}
            savedConversation={savedConversation}
            conversations={visibleConversations}
            hiddenConversations={hiddenConversations}
            archivedConversations={archivedConversations}
            activeId={activeId}
            search={search}
            onSearchChange={setSearch}
            category={activeCategory}
            onCategoryChange={setActiveCategory}
            folder={activeFolder}
            onFolderChange={setActiveFolder}
            onSelect={selectConversation}
            onChatMenuAction={handleChatMenuActionWithSafety}
            onCreateGroup={() => setCreateSpaceOpen(true)}
            drafts={drafts}
          />
        }
        main={
          <section ref={chatMainRef} className={`chat-main ${isSecret ? "secret-chat-root" : ""}`}>
            {active ? (
              <>
                <ChatHeader
                  conversation={active}
                  onStartCall={startCall}
                  onBack={isNarrow ? handleBackToList : undefined}
                  onOpenProfile={() => setProfileOpen(true)}
                  onOpenSearch={() => setSearchOpen(true)}
                  isSuperSecret={isSuperSecret}
                  onToggleSuperSecret={() => activeId && toggleSuperSecret(activeId)}
                />
                {searchOpen ? (
                  <MessageSearchPanel
                    open={searchOpen}
                    onClose={() => setSearchOpen(false)}
                    conversationId={activeId}
                    keywordFilter={messageFilter}
                    onKeywordFilterChange={setMessageFilter}
                    messages={messagesForActive.map((m) => ({
                      id: m.id,
                      text: m.text,
                      sentAt: m.sentAt,
                    }))}
                  />
                ) : null}
                {pinnedMessage ? (
                  <PinnedMessagesBar
                    message={pinnedMessage}
                    peerName={active.name}
                    onUnpin={unpinMessage}
                  />
                ) : null}
                {active.isLocked ? (
                  <div className="contact-request-banner">
                    <span className="contact-request-banner__icon">🔒</span>
                    <span className="contact-request-banner__text">
                      <strong>{active.name}</strong> sent you a contact request.
                      Messages are hidden until you respond.
                    </span>
                    <div className="contact-request-banner__actions">
                      <button
                        type="button"
                        className="contact-request-banner__btn contact-request-banner__btn--accept"
                        disabled={contactRequestBusy || !contactRequestId}
                        onClick={() => void acceptLockedRequest()}
                      >
                        ✓ Accept
                      </button>
                      <button
                        type="button"
                        className="contact-request-banner__btn contact-request-banner__btn--decline"
                        disabled={contactRequestBusy || !contactRequestId}
                        onClick={() => void declineLockedRequest()}
                      >
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                ) : null}
                <ChatDropZone
                  disabled={!canPost || isSecret || selectionMode}
                  onFiles={(files) => {
                    void Promise.all(files.map((f) => sendFileMessage(f)));
                  }}
                >
                  <MessageList
                    conversationId={activeId ?? undefined}
                    loading={messagesLoading}
                    messages={messagesForActive}
                    isGroup={Boolean(active.isGroup)}
                    isChannelAdmin={Boolean(active.isChannelAdmin)}
                    isSecret={isSecret}
                    isSuperSecret={isSuperSecret}
                    selectionMode={selectionMode}
                    selectedMessageIds={selectedMessageIds}
                    onToggleSelection={toggleMessageSelection}
                    onMenuAction={handleMessageMenuAction}
                    onConsumeEphemeral={consumeEphemeralMessage}
                    onCancelSelection={exitSelectionMode}
                    onToggleReaction={toggleReaction}
                    pinnedMessageId={pinnedMessage?.id ?? null}
                    onAtBottom={markMessagesRead}
                    onIncomingVisible={markMessageDelivered}
                    showReadReceipts={readReceiptsEnabled}
                    onRetryMessage={retryMessage}
                    onLoadOlder={loadOlderMessages}
                    hasOlderMessages={hasOlderMessages}
                  />
                </ChatDropZone>
                {!selectionMode ? <ChatTypingBar conversation={active} /> : null}
                {selectionMode ? (
                  <MessageSelectionBar
                    count={selectedMessageIds.size}
                    isGroup={Boolean(active.isGroup)}
                    showDeleteForEveryone={showDeleteSelectionForEveryone}
                    onCancel={exitSelectionMode}
                    onDeleteForMe={() => deleteSelectedMessages("me")}
                    onDeleteForEveryone={() => deleteSelectedMessages("everyone")}
                  />
                ) : null}
                {/* Broadcast channel read-only for non-admins — no composer at all */}
                {active.isChannel && !active.isChannelAdmin ? null : (
                  <MessageComposer
                    key={activeId}
                    conversationId={activeId}
                    isSecret={isSecret}
                    secureMode={isSuperSecret}
                    disabled={!canPost}
                    recentMessages={[]}
                    initialText={activeId ? (drafts[activeId] ?? "") : ""}
                    onDraftChange={(text) => activeId && setDraft(activeId, text)}
                    onSend={sendMessage}
                    onScheduleRequest={(t) => {
                      setSchedulePendingText(t);
                      setScheduleOpen(true);
                    }}
                    onSendVoice={sendVoiceMessage}
                    onSendFile={sendFileMessage}
                    onSendGif={sendGifMessage}
                    onSendSticker={sendStickerMessage}
                    selectionMode={selectionMode}
                    editingText={editingMessage?.text ?? null}
                    onSaveEdit={saveEditMessage}
                    onCancelEdit={cancelEditMessage}
                    replyingTo={replyingTo}
                    replyPeerName={active.name}
                    onCancelReply={cancelReply}
                  />
                )}
                {scheduleOpen && activeId ? (
                  <ScheduleModalMemo
                    conversationId={activeId}
                    text={schedulePendingText}
                    onClose={handleScheduleClose}
                    onScheduled={handleScheduleClose}
                  />
                ) : null}
              </>
            ) : (
              <div className="chat-empty">
                <div className="chat-empty__icon-svg">
                  <IconChats size={48} />
                </div>
                <p>Select a chat to start messaging</p>
              </div>
            )}
          </section>
        }
        renderProfile={({ onClose }) => (
          <ProfilePanel
            conversation={active}
            messages={messagesForActive}
            onClose={onClose}
          />
        )}
      />
      {safetyNumberConv && (
        <SafetyNumberModal
          peerUserId={safetyNumberConv.peerId}
          peerName={safetyNumberConv.peerName}
          onClose={() => setSafetyNumberConv(null)}
        />
      )}
    </div>
  );
}
