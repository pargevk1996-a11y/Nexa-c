import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  focusChatComposer,
  focusChatSearchInput,
  useChatKeyboardShortcuts,
} from "@/hooks/useChatKeyboardShortcuts";
import { conversationMatchesSearch } from "@/utils/userSearch";
import { getCachedSession } from "@/api/auth";
import { useCall } from "@/calls/CallProvider";
import { resolveDemoCallPeers } from "@/calls/demoCallPeers";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatLeftPanel } from "@/components/chat/ChatLeftPanel";
import { ResizableChatShell } from "@/components/chat/ResizableChatShell";
import { ProfilePanel } from "@/components/chat/ProfilePanel";
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
  const {
    visibleConversations,
    hiddenConversations,
    savedConversation,
    activeId,
    selectConversation,
    search,
    setSearch,
    activeCategory,
    setActiveCategory,
    activeFolder,
    setActiveFolder,
    pinUnlocked,
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
  }, [activeId]);

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
            activeId={activeId}
            search={search}
            onSearchChange={setSearch}
            category={activeCategory}
            onCategoryChange={setActiveCategory}
            folder={activeFolder}
            onFolderChange={setActiveFolder}
            pinUnlocked={pinUnlocked}
            onSelect={selectConversation}
            onChatMenuAction={handleChatMenuAction}
            onCreateGroup={() => setCreateSpaceOpen(true)}
            drafts={drafts}
          />
        }
        main={
          <section className={`chat-main ${isSecret ? "secret-chat-root" : ""}`}>
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
                <MessageComposer
                  key={activeId}
                  conversationId={activeId}
                  isSecret={isSecret}
                  secureMode={isSuperSecret}
                  disabled={!canPost}
                  readOnlyHint={
                    !canPost && active.isChannel
                      ? "Only channel admins can post in this broadcast channel."
                      : undefined
                  }
                  recentMessages={[]}
                  initialText={activeId ? (drafts[activeId] ?? "") : ""}
                  onDraftChange={(text) => activeId && setDraft(activeId, text)}
                  onSend={sendMessage}
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
    </div>
  );
}
