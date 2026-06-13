import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { buildMessageRows } from "@/utils/messageLayout";
import { IconChats } from "@/components/icons/Icons";
import { EphemeralWrapper } from "@/components/chat/EphemeralWrapper";
import {
  MessageContextMenu,
  type MessageMenuAction,
} from "@/components/chat/MessageContextMenu";
import type { Message } from "@/types";
import { FormattedMessageText } from "./FormattedMessageText";
import { FileMessage } from "./FileMessage";
import { GifMessage } from "./GifMessage";
import { StickerMessage } from "./StickerMessage";
import { LinkPreview } from "./LinkPreview";
import { MessageReactions } from "./MessageReactions";
import { PollMessage } from "./PollMessage";
import { VideoMessage } from "./VideoMessage";
import { VoiceMessage } from "./VoiceMessage";
import { MessageListSkeleton } from "./MessageListSkeleton";
import { MessageReceiptIcons } from "./MessageReceiptIcons";
import { collectGalleryImages, ImageGallery } from "@/components/media/ImageGallery";

interface MessageListProps {
  conversationId?: string;
  loading?: boolean;
  messages: Message[];
  isGroup: boolean;
  isSecret?: boolean;
  isSuperSecret?: boolean;
  selectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelection: (messageId: string) => void;
  onMenuAction: (message: Message, action: MessageMenuAction) => void;
  onConsumeEphemeral?: (messageId: string) => void;
  onCancelSelection?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  pinnedMessageId?: string | null;
  onAtBottom?: () => void;
  onIncomingVisible?: (messageId: string) => void;
  showReadReceipts?: boolean;
  onRetryMessage?: (messageId: string) => void;
  onLoadOlder?: () => Promise<void>;
  hasOlderMessages?: boolean;
}

interface ContextState {
  message: Message;
  x: number;
  y: number;
}

// Virtuoso anchors prepended items relative to a large base index. When older
// messages are loaded at the head, we decrement firstItemIndex by the number of
// rows prepended so the viewport stays pinned to the same message (no jump).
const START_INDEX = 1_000_000;

function MessageBadges({ message }: { message: Message }) {
  const badges: string[] = [];
  if (message.editedAt) badges.push("edited");
  if (message.silent) badges.push("silent");
  if (message.scheduledAt) badges.push("scheduled");
  if (badges.length === 0) return null;
  return (
    <span className="chat-bubble__badges">
      {badges.map((b) => (
        <span key={b} className={`chat-bubble__badge chat-bubble__badge--${b}`}>
          {b === "edited" ? "edited" : b === "silent" ? "🔕" : "⏰"}
        </span>
      ))}
    </span>
  );
}

function MessageMeta({
  message,
  sending,
  showReadReceipts,
  onRetry,
}: {
  message: Message;
  sending: boolean;
  showReadReceipts: boolean;
  onRetry?: (messageId: string) => void;
}) {
  const failed = message.status === "failed";

  return (
    <div className="chat-bubble__time">
      <MessageBadges message={message} />
      <span className="chat-bubble__time-text">{message.sentAt}</span>
      {message.scheduledAt ? (
        <span className="chat-bubble__time-extra"> · {message.scheduledAt}</span>
      ) : null}
      {message.ephemeral ? (
        <span className="chat-bubble__time-extra"> · Disappearing</span>
      ) : null}
      {failed ? (
        <>
          <span className="chat-bubble__status--failed">Not sent</span>
          {onRetry ? (
            <button
              type="button"
              className="chat-bubble__retry"
              onClick={() => onRetry(message.id)}
            >
              Retry
            </button>
          ) : null}
        </>
      ) : message.outgoing && !message.recalled ? (
        <MessageReceiptIcons
          status={sending ? "sending" : message.status}
          showDetailedReceipts={showReadReceipts}
        />
      ) : null}
    </div>
  );
}

function MessageBody({
  message,
  isSecret,
  isSuperSecret,
  onEphemeralOpen,
  onImageClick,
}: {
  message: Message;
  isSecret?: boolean;
  isSuperSecret?: boolean;
  onEphemeralOpen?: () => void;
  onImageClick?: (messageId: string) => void;
}) {
  if (message.recalled || message.deleted) {
    return (
      <div
        className={`chat-bubble chat-bubble--recalled ${message.deleted ? "chat-bubble--deleted" : ""} ${isSecret ? "chat-bubble--secret" : ""}`}
      >
        {message.text}
      </div>
    );
  }
  if (message.kind === "voice") {
    return <VoiceMessage message={message} />;
  }
  if (message.kind === "video") {
    return <VideoMessage message={message} />;
  }
  if (message.kind === "file") {
    return (
      <FileMessage message={message} onOpen={onEphemeralOpen} onImageClick={onImageClick} isSuperSecret={isSuperSecret || message.secureMode} />
    );
  }
  if (message.kind === "sticker") {
    return <StickerMessage message={message} />;
  }
  if (message.kind === "gif") {
    return <GifMessage message={message} />;
  }
  if (message.kind === "poll" || message.kind === "quiz" || message.poll || message.quiz) {
    return (
      <>
        {message.forwardFrom ? (
          <div className="chat-bubble__forward-label">Forwarded from {message.forwardFrom}</div>
        ) : null}
        {message.replyTo ? (
          <blockquote className="chat-bubble__reply-quote">
            <span className="chat-bubble__reply-author">{message.replyTo.senderLabel}</span>
            <span className="chat-bubble__reply-text">{message.replyTo.text}</span>
          </blockquote>
        ) : null}
        <PollMessage message={message} isSecret={isSecret} />
      </>
    );
  }
  return (
    <>
      {message.forwardFrom ? (
        <div className="chat-bubble__forward-label">Forwarded from {message.forwardFrom}</div>
      ) : null}
      {message.replyTo ? (
        <blockquote className="chat-bubble__reply-quote">
          <span className="chat-bubble__reply-author">{message.replyTo.senderLabel}</span>
          <span className="chat-bubble__reply-text">{message.replyTo.text}</span>
        </blockquote>
      ) : null}
      <div className={`chat-bubble ${isSecret ? "chat-bubble--secret" : ""} ${message.secureMode ? "chat-bubble--secure" : ""}`}>
        <FormattedMessageText text={message.text} />
      </div>
      {message.linkPreview ? <LinkPreview preview={message.linkPreview} /> : null}
    </>
  );
}

function EphemeralMessageRow({
  message,
  isSecret,
  onConsume,
  onImageClick,
}: {
  message: Message;
  isSecret?: boolean;
  onConsume: () => void;
  onImageClick?: (messageId: string) => void;
}) {
  const viewStartRef = useRef<(() => void) | null>(null);

  return (
    <EphemeralWrapper
      message={message}
      isSecret={isSecret}
      onConsume={onConsume}
      onBindViewStart={(start) => {
        viewStartRef.current = start;
      }}
    >
      <MessageBody
        message={message}
        isSecret={isSecret}
        onEphemeralOpen={() => viewStartRef.current?.()}
        onImageClick={onImageClick}
      />
    </EphemeralWrapper>
  );
}

function isSendingMessage(m: Message): boolean {
  if (m.status === "failed") return false;
  return m.status === "sending" || m.id.startsWith("pending-");
}

export function MessageList({
  conversationId,
  loading = false,
  messages,
  isGroup,
  isSecret,
  isSuperSecret,
  selectionMode,
  selectedMessageIds,
  onToggleSelection,
  onMenuAction,
  onConsumeEphemeral,
  onCancelSelection,
  onToggleReaction,
  pinnedMessageId,
  onAtBottom,
  onIncomingVisible,
  showReadReceipts = true,
  onRetryMessage,
  onLoadOlder,
  hasOlderMessages = false,
}: MessageListProps) {
  const [menu, setMenu] = useState<ContextState | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Mirrors isAtBottom for use inside callbacks without re-subscribing.
  const isAtBottomRef = useRef(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // Virtuoso anchors prepended items via a large virtual index.
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  // Disarmed when the user scrolls up; re-armed when they reach the bottom.
  // Controls whether followOutput should scroll to new messages.
  const stickToBottomRef = useRef(true);
  const prevConversationIdRef = useRef<string | undefined>(conversationId);
  // Prepend-detection bookkeeping for stable firstItemIndex maintenance.
  const prevRowsLenRef = useRef(0);
  const oldestMsgIdRef = useRef<string | null>(null);
  // True after Virtuoso's first render for this conversation is committed to
  // the DOM. The scroll-up detector must not fire before this — during
  // initialTopMostItemIndex positioning Virtuoso moves scrollTop internally,
  // and treating that as user intent would permanently disarm stickToBottom.
  const listReadyRef = useRef(false);
  // Per-conversation guard: arm listReadyRef exactly once per chat open.
  const readyConvRef = useRef<string | undefined>(undefined);

  const rows = useMemo(() => buildMessageRows(messages), [messages]);
  const galleryImages = useMemo(() => collectGalleryImages(messages), [messages]);

  // Reset all per-conversation state on conversation switch.
  useEffect(() => {
    setGalleryIndex(null);
    if (conversationId === prevConversationIdRef.current) return;
    prevConversationIdRef.current = conversationId;
    setIsLoadingOlder(false);
    setIsAtBottom(true);
    isAtBottomRef.current = true;
    stickToBottomRef.current = true;
    setFirstItemIndex(START_INDEX);
    prevRowsLenRef.current = 0;
    oldestMsgIdRef.current = null;
    // Disable scroll-up detection until the new Virtuoso instance has
    // finished its initial render at initialTopMostItemIndex.
    listReadyRef.current = false;
  }, [conversationId]);

  // Arm the scroll-up detector after Virtuoso's first render with data.
  // One requestAnimationFrame is enough — by then initialTopMostItemIndex
  // positioning is committed and any Virtuoso-internal scrollTop adjustments
  // are complete. Fires at most once per conversation (readyConvRef guard).
  useEffect(() => {
    if (rows.length === 0) return;
    if (readyConvRef.current === conversationId) return;
    readyConvRef.current = conversationId;
    listReadyRef.current = false;
    const raf = requestAnimationFrame(() => {
      listReadyRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [conversationId, rows.length]);

  // Detect genuine user scroll-up to disarm auto-follow. Gated on listReadyRef
  // so Virtuoso's own initial positioning is never misread as user intent.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      if (listReadyRef.current && top < lastTop - 4) {
        stickToBottomRef.current = false;
      }
      lastTop = top;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversationId]);

  // Maintain Virtuoso's firstItemIndex when older messages are prepended at
  // the head so the visible message stays anchored (no scroll jump).
  useLayoutEffect(() => {
    const oldestId = messages.length ? messages[0].id : null;
    const grew = rows.length - prevRowsLenRef.current;
    const prepended =
      grew > 0 && oldestMsgIdRef.current != null && oldestId !== oldestMsgIdRef.current;
    if (prepended) {
      setFirstItemIndex((idx) => idx - grew);
    }
    prevRowsLenRef.current = rows.length;
    oldestMsgIdRef.current = oldestId;
  }, [rows, messages]);

  // Mobile keyboard: snap back to last message when the keyboard shrinks the
  // viewport, but only if the user is already at the bottom.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let lastHeight = vv.height;
    const onResize = () => {
      const shrank = vv.height < lastHeight - 60;
      lastHeight = vv.height;
      if (shrank && isAtBottomRef.current) {
        virtuosoRef.current?.scrollToIndex({
          index: rows.length - 1,
          align: "end",
          behavior: "auto",
        });
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [rows.length]);

  useEffect(() => {
    if (!selectionMode || !onCancelSelection) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (menu) {
        setMenu(null);
        return;
      }
      onCancelSelection?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionMode, menu, onCancelSelection]);

  const openMenu = useCallback(
    (message: Message, e: React.MouseEvent) => {
      if (isSecret || message.ephemeral) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setMenu({ message, x: e.clientX, y: e.clientY });
    },
    [isSecret],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleStartReached = useCallback(() => {
    if (isLoadingOlder || !hasOlderMessages || !onLoadOlder) return;
    setIsLoadingOlder(true);
    void onLoadOlder().finally(() => setIsLoadingOlder(false));
  }, [isLoadingOlder, hasOlderMessages, onLoadOlder]);

  function renderContent(m: Message) {
    if (m.ephemeral && !m.recalled) {
      return (
        <EphemeralMessageRow
          message={m}
          isSecret={isSecret}
          onConsume={() => onConsumeEphemeral?.(m.id)}
          onImageClick={openGallery}
        />
      );
    }
    return <MessageBody message={m} isSecret={isSecret} isSuperSecret={isSuperSecret} onImageClick={openGallery} />;
  }

  const openGallery = useCallback(
    (messageId: string) => {
      const idx = galleryImages.findIndex((g) => g.messageId === messageId);
      if (idx >= 0) setGalleryIndex(idx);
    },
    [galleryImages],
  );

  // Show skeleton while data is loading or not yet arrived — never mount
  // Virtuoso with an empty array and then repopulate it, which would cause
  // a visible render-at-top-then-scroll-to-bottom jump.
  if (loading || messages.length === 0) {
    if (loading) return <MessageListSkeleton />;
    return (
      <div className="chat-empty">
        <div className="chat-empty__icon-svg">
          <IconChats size={48} />
        </div>
        <p>Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <div className="chat-messages-wrap">
      {/*
        key={conversationId} destroys and recreates the Virtuoso instance on
        every conversation switch, giving each chat a clean slate with its own
        firstItemIndex / scroll position / measured heights. Combined with
        initialTopMostItemIndex={rows.length - 1}, Virtuoso starts its FIRST
        render already at the last message — no scrollTo correction needed,
        no visible jump.
      */}
      <Virtuoso
        key={conversationId ?? "none"}
        ref={virtuosoRef}
        scrollerRef={(ref) => { scrollerRef.current = ref as HTMLElement | null; }}
        className={`chat-messages ${isSecret ? "chat-messages--secret" : "chat-messages--copy-ok"}`}
        role="log"
        aria-live="polite"
        data={rows}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={rows.length - 1}
        alignToBottom={true}
        followOutput={(atBottom) => (atBottom ? "auto" : false)}
        overscan={600}
        startReached={hasOlderMessages && !isLoadingOlder ? handleStartReached : undefined}
        components={{
          Header: isLoadingOlder ? () => <div className="chat-history-loading">Loading…</div> : undefined,
          Footer: () => (
            <div style={{ height: "calc(4.5rem + var(--keyboard-inset, 0px))" }} aria-hidden />
          ),
        }}
        atBottomStateChange={(atBottom) => {
          isAtBottomRef.current = atBottom;
          setIsAtBottom(atBottom);
          if (atBottom) {
            stickToBottomRef.current = true;
            onAtBottom?.();
          }
        }}
        itemsRendered={(renderedItems) => {
          if (!onIncomingVisible) return;
          for (const item of renderedItems) {
            const row = rows[item.index];
            if (row?.type === "message") {
              const m = row.message;
              if (!m.outgoing && m.status !== "read") onIncomingVisible(m.id);
            }
          }
        }}
        itemContent={(index, row) => {
          if (row.type === "date") {
            return (
              <div key={row.key} className="chat-date-divider">
                {row.label}
              </div>
            );
          }
          const m = row.message;
          const selected = selectedMessageIds.has(m.id);
          const sending = m.outgoing && isSendingMessage(m);
          return (
            <div className={m.outgoing ? "msg-row msg-row--out" : "msg-row msg-row--in"}>
            <div
              className={`chat-bubble-row ${m.outgoing ? "chat-bubble-row--out" : "chat-bubble-row--in"} ${row.grouped ? "chat-bubble-row--grouped" : ""} ${row.showTail ? "chat-bubble-row--tail" : ""} ${selected ? "chat-bubble-row--selected" : ""} ${m.ephemeral ? "chat-bubble-row--ephemeral" : ""} ${sending ? "chat-bubble-row--sending" : ""} ${m.status === "failed" ? "chat-bubble-row--failed" : ""} ${m.kind === "sticker" ? "chat-bubble-row--sticker" : ""} ${m.kind === "gif" ? "chat-bubble-row--gif" : ""}`}
              onContextMenu={(e) => openMenu(m, e)}
              onClick={selectionMode ? () => onToggleSelection(m.id) : undefined}
            >
              {selectionMode ? (
                <label className="chat-bubble-row__check">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelection(m.id)}
                    aria-label="Select message"
                  />
                </label>
              ) : null}
              <div className="chat-bubble-row__body">
                {renderContent(m)}
                {row.showTail ? (
                  <MessageMeta
                    message={m}
                    sending={sending}
                    showReadReceipts={showReadReceipts}
                    onRetry={onRetryMessage}
                  />
                ) : null}
                {!isSecret && !selectionMode && !m.recalled && row.showTail ? (
                  <MessageReactions
                    messageId={m.id}
                    reactions={m.reactions}
                    myReaction={m.myReaction}
                    onToggleReaction={
                      onToggleReaction ? (emoji) => onToggleReaction(m.id, emoji) : undefined
                    }
                  />
                ) : null}
              </div>
            </div>
            </div>
          );
        }}
      />
      {!isAtBottom ? (
        <button
          className="chat-scroll-bottom"
          onClick={() =>
            virtuosoRef.current?.scrollToIndex({
              index: rows.length - 1,
              align: "end",
              behavior: "smooth",
            })
          }
          aria-label="Jump to latest message"
        >
          <svg width="22" height="13" viewBox="0 0 22 13" fill="none" aria-hidden>
            <path d="M1 1L11 11L21 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      ) : null}
      {galleryIndex != null && galleryImages.length > 0 ? (
        <ImageGallery
          images={galleryImages}
          index={galleryIndex}
          onClose={() => setGalleryIndex(null)}
          onIndexChange={setGalleryIndex}
        />
      ) : null}
      {menu ? (
        <MessageContextMenu
          message={menu.message}
          isGroup={isGroup}
          isSecret={isSecret}
          isSuperSecret={isSuperSecret}
          isPinned={pinnedMessageId === menu.message.id || Boolean(menu.message.pinned)}
          position={{ x: menu.x, y: menu.y }}
          onClose={closeMenu}
          onAction={(action) => onMenuAction(menu.message, action)}
        />
      ) : null}
    </div>
  );
}
