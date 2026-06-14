import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// memo: row sub-components receive a stable `message` reference (the array item
// is unchanged unless that specific message updated), so a new message or any
// parent state change re-runs Virtuoso's itemContent but these short-circuit.
const MessageBadges = memo(function MessageBadges({ message }: { message: Message }) {
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
});

const MessageMeta = memo(function MessageMeta({
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
});

const MessageBody = memo(function MessageBody({
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
});

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
  // INVERTED CHAT: rows[0] is the NEWEST message and sits at the TOP; scrolling
  // DOWN reveals older messages, which are loaded at the tail. "At top" therefore
  // means "viewing the latest message" — the equivalent of "at bottom" in a
  // normal chat.
  const [isAtTop, setIsAtTop] = useState(true);
  // The list is rendered invisibly until it has been pinned to the newest
  // message (top). Virtuoso's initial positioning + variable-height measurement
  // + async media loading all move the scroll position on first paint; hiding
  // the list during that settling means the user only ever sees the final state
  // — the latest message already in view — with zero visible scrolling.
  const [pinned, setPinned] = useState(false);
  // Mirrors isAtTop for use inside callbacks without re-subscribing.
  const isAtTopRef = useRef(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // Virtuoso anchors prepended items via a large virtual index.
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  // Disarmed when the user scrolls DOWN (away from the newest message at the
  // top); re-armed when they return to the top. Controls whether a freshly
  // arrived message auto-scrolls into view.
  const stickToTopRef = useRef(true);
  const prevConversationIdRef = useRef<string | undefined>(conversationId);
  // Head-prepend detection: a NEW message becomes rows[0] (the head). Track the
  // newest message id so we can keep the scroll position stable via firstItemIndex.
  const prevRowsLenRef = useRef(0);
  const newestMsgIdRef = useRef<string | null>(null);
  // True after Virtuoso's first render for this conversation is committed to
  // the DOM. The scroll detector must not fire before this — during
  // initialTopMostItemIndex positioning Virtuoso moves scrollTop internally,
  // and treating that as user intent would permanently disarm stickToTop.
  const listReadyRef = useRef(false);
  // Per-conversation guard: arm listReadyRef exactly once per chat open.
  const readyConvRef = useRef<string | undefined>(undefined);
  // "Opening window": true for a short settling period right after a chat is
  // opened. While true, ANY change to the list's total height (async media,
  // link previews, voice waveforms, video thumbs, or Virtuoso's own
  // variable-height measurement) instantly re-pins the viewport to the very
  // top (newest message). This guarantees the chat always lands exactly on the
  // latest message — never mid-history, never with a visible scroll. It does not
  // affect load-older (that needs the user at the bottom, impossible while
  // pinned to the top during this window).
  const openingRef = useRef(true);
  // Debounce timer for "heights have settled": while the chat is opening, every
  // total-height change (media load, measurement) resets this. When no change
  // happens for a short window, the list is genuinely stable at the top and is
  // revealed. This is what guarantees the user never sees the list move.
  const settleTimerRef = useRef<number | undefined>(undefined);

  const rows = useMemo(() => buildMessageRows(messages, true), [messages]);
  // Always-current row count for use inside callbacks/timers without re-binding.
  const rowsLenRef = useRef(rows.length);
  rowsLenRef.current = rows.length;
  const galleryImages = useMemo(() => collectGalleryImages(messages), [messages]);
  // Hold the latest gallery list in a ref so openGallery can stay referentially
  // stable (empty deps). Otherwise its identity would change on every new
  // message and break the memoized MessageBody for all visible rows.
  const galleryImagesRef = useRef(galleryImages);
  galleryImagesRef.current = galleryImages;

  // Pin the viewport to the newest message (top, index 0) instantly (no animation).
  const pinToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 0,
      align: "start",
      behavior: "auto",
    });
  }, []);

  // Reveal the list and end the opening window in one shot, so there can be no
  // post-reveal re-pin (= no visible jump once the user can see the list).
  const revealAndClose = useCallback(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
    pinToTop();
    openingRef.current = false;
    setPinned(true);
  }, [pinToTop]);

  // (Re)start the settle countdown. Called on every height change while opening;
  // when heights stop changing for ~140ms the list is stable and we reveal it.
  const armSettle = useCallback(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(revealAndClose, 140);
  }, [revealAndClose]);

  // Reset all per-conversation state on conversation switch.
  useEffect(() => {
    setGalleryIndex(null);
    if (conversationId === prevConversationIdRef.current) return;
    prevConversationIdRef.current = conversationId;
    setIsLoadingOlder(false);
    setIsAtTop(true);
    isAtTopRef.current = true;
    stickToTopRef.current = true;
    setFirstItemIndex(START_INDEX);
    prevRowsLenRef.current = 0;
    newestMsgIdRef.current = null;
    // Disable the scroll detector until the new Virtuoso instance has
    // finished its initial render at initialTopMostItemIndex.
    listReadyRef.current = false;
    // Re-arm the opening window so the new chat snaps to its newest message (top).
    openingRef.current = true;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
    // Hide the new chat until it is pinned to its newest message.
    setPinned(false);
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
    // Open the window: list stays hidden + pinned to the top on every height
    // change until heights settle (armSettle), then it is revealed already at
    // the newest message. The user never sees the positioning or any media reflow.
    openingRef.current = true;
    const raf = requestAnimationFrame(() => {
      listReadyRef.current = true;
      pinToTop();
      armSettle();
    });
    // Hard cap: never stay hidden longer than 1.2s, even if media keeps loading
    // (slow network). Reveal pinned-to-top regardless.
    const cap = window.setTimeout(revealAndClose, 1200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(cap);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
    // rows.length is intentionally a dep only to fire once rows first arrive;
    // the readyConvRef guard makes this a per-conversation one-shot, so loading
    // older messages (same conversationId) never re-arms the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, rows.length, pinToTop, armSettle, revealAndClose]);

  // Detect a genuine user scroll-DOWN (away from the newest message at the top)
  // to disarm auto-follow. Gated on listReadyRef so Virtuoso's own initial
  // positioning is never misread as user intent.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      if (listReadyRef.current && top > lastTop + 4) {
        stickToTopRef.current = false;
      }
      lastTop = top;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversationId]);

  // A NEW message becomes rows[0] (the head). Maintain firstItemIndex so the
  // user's current scroll position stays anchored when that happens; loading
  // older messages appends at the tail and needs no adjustment.
  useLayoutEffect(() => {
    const newestId = messages.length ? messages[messages.length - 1].id : null;
    const grew = rows.length - prevRowsLenRef.current;
    const prependedAtHead =
      grew > 0 && newestMsgIdRef.current != null && newestId !== newestMsgIdRef.current;
    if (prependedAtHead) {
      setFirstItemIndex((idx) => idx - grew);
    }
    prevRowsLenRef.current = rows.length;
    newestMsgIdRef.current = newestId;
  }, [rows, messages]);

  // When a new message arrives and the user is viewing the newest (at the top),
  // scroll the new message into view at the top.
  useEffect(() => {
    if (!listReadyRef.current) return;
    if (stickToTopRef.current && isAtTopRef.current) {
      virtuosoRef.current?.scrollToIndex({ index: 0, align: "start", behavior: "auto" });
    }
    // Trigger only when the newest message changes.
  }, [messages.length ? messages[messages.length - 1]?.id : null]);

  // Mobile keyboard: snap back to the newest message when the keyboard shrinks
  // the viewport, but only if the user is already at the top.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let lastHeight = vv.height;
    const onResize = () => {
      const shrank = vv.height < lastHeight - 60;
      lastHeight = vv.height;
      if (shrank && isAtTopRef.current) {
        virtuosoRef.current?.scrollToIndex({
          index: 0,
          align: "start",
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

  // Older messages live at the TAIL of the inverted list, so they are fetched
  // when the user scrolls DOWN to the end.
  const handleLoadOlder = useCallback(() => {
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

  const openGallery = useCallback((messageId: string) => {
    const idx = galleryImagesRef.current.findIndex((g) => g.messageId === messageId);
    if (idx >= 0) setGalleryIndex(idx);
  }, []);

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
        INVERTED chat: rows[0] is the newest message and is shown at the TOP.
        key={conversationId} recreates the Virtuoso instance per chat (clean
        firstItemIndex / scroll / measured heights). initialTopMostItemIndex
        { index: 0, align: "start" } starts the FIRST render already at the
        newest message at the top — no scrollTo correction, no visible jump.
      */}
      {/* Skeleton overlay covers the list while it positions itself to the newest
          message, so the user never sees the scroll settling or a blank flash. */}
      {!pinned ? (
        <div className="chat-messages-pinning" aria-hidden>
          <MessageListSkeleton />
        </div>
      ) : null}
      <Virtuoso
        key={conversationId ?? "none"}
        ref={virtuosoRef}
        scrollerRef={(ref) => { scrollerRef.current = ref as HTMLElement | null; }}
        className={`chat-messages ${isSecret ? "chat-messages--secret" : "chat-messages--copy-ok"}`}
        style={{ opacity: pinned ? 1 : 0 }}
        role="log"
        aria-live="polite"
        data={rows}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={{ index: 0, align: "start" }}
        alignToBottom={false}
        totalListHeightChanged={() => {
          // Async content (images, link previews, voice/video) and Virtuoso's
          // own height measurement change the total height after first paint.
          // While opening, keep the viewport pinned to the TOP AND restart the
          // settle countdown — the list is only revealed once these stop, so the
          // user never sees the reflow. (load-older is unaffected: it needs the
          // user at the bottom, impossible while pinned during this window.)
          if (openingRef.current) {
            pinToTop();
            armSettle();
          }
        }}
        overscan={600}
        endReached={hasOlderMessages && !isLoadingOlder ? handleLoadOlder : undefined}
        components={{
          // Older history loads at the bottom of the inverted list; the spacer
          // also keeps the oldest row clear of the floating composer.
          Footer: () => (
            <>
              {isLoadingOlder ? <div className="chat-history-loading">Loading…</div> : null}
              <div style={{ height: "calc(4.5rem + var(--keyboard-inset, 0px))" }} aria-hidden />
            </>
          ),
        }}
        atTopStateChange={(atTop) => {
          isAtTopRef.current = atTop;
          setIsAtTop(atTop);
          if (atTop) {
            stickToTopRef.current = true;
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
      {!isAtTop ? (
        <button
          className="chat-scroll-bottom"
          onClick={() =>
            virtuosoRef.current?.scrollToIndex({
              index: 0,
              align: "start",
              behavior: "smooth",
            })
          }
          aria-label="Jump to latest message"
        >
          {/* Chevron points UP — the newest message is at the top. */}
          <svg width="22" height="13" viewBox="0 0 22 13" fill="none" aria-hidden>
            <path d="M1 12L11 2L21 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
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
