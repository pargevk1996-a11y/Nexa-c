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
  const [isAtBottom, setIsAtBottom] = useState(true);
  // The list is rendered invisibly until it has been pinned to the last
  // message. Virtuoso's initial positioning + variable-height measurement +
  // async media loading all move the scroll position on first paint; hiding the
  // list during that settling means the user only ever sees the final state —
  // the latest message already in view — with zero visible scrolling.
  const [pinned, setPinned] = useState(false);
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
  // "Opening window": true for a short settling period right after a chat is
  // opened. While true, ANY change to the list's total height (async media,
  // link previews, voice waveforms, video thumbs, or Virtuoso's own
  // variable-height measurement) instantly re-pins the viewport to the very
  // last message. This guarantees the chat always lands exactly on the latest
  // message — never mid-history, never with a visible scroll. It does not
  // affect load-older (that needs the user at the top, impossible while pinned
  // to the bottom during this window).
  const openingRef = useRef(true);
  // Debounce timer for "heights have settled": while the chat is opening, every
  // total-height change (media load, measurement) resets this. When no change
  // happens for a short window, the list is genuinely stable at the bottom and
  // is revealed. This is what guarantees the user never sees the list move.
  const settleTimerRef = useRef<number | undefined>(undefined);

  const rows = useMemo(() => buildMessageRows(messages), [messages]);
  // Always-current row count for use inside callbacks/timers without re-binding.
  const rowsLenRef = useRef(rows.length);
  rowsLenRef.current = rows.length;
  const galleryImages = useMemo(() => collectGalleryImages(messages), [messages]);
  // Hold the latest gallery list in a ref so openGallery can stay referentially
  // stable (empty deps). Otherwise its identity would change on every new
  // message and break the memoized MessageBody for all visible rows.
  const galleryImagesRef = useRef(galleryImages);
  galleryImagesRef.current = galleryImages;

  // Pin the viewport to the last message instantly (no animation).
  const pinToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: rowsLenRef.current - 1,
      align: "end",
      behavior: "auto",
    });
  }, []);

  // Reveal the list and end the opening window in one shot, so there can be no
  // post-reveal re-pin (= no visible jump once the user can see the list).
  const revealAndClose = useCallback(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
    pinToBottom();
    openingRef.current = false;
    setPinned(true);
  }, [pinToBottom]);

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
    setIsAtBottom(true);
    isAtBottomRef.current = true;
    stickToBottomRef.current = true;
    setFirstItemIndex(START_INDEX);
    prevRowsLenRef.current = 0;
    oldestMsgIdRef.current = null;
    // Disable scroll-up detection until the new Virtuoso instance has
    // finished its initial render at initialTopMostItemIndex.
    listReadyRef.current = false;
    // Re-arm the opening window so the new chat snaps to its last message.
    openingRef.current = true;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
    // Hide the new chat until it is pinned to its last message.
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
    // Open the window: list stays hidden + pinned to the bottom on every height
    // change until heights settle (armSettle), then it is revealed already at
    // the last message. The user never sees the positioning or any media reflow.
    openingRef.current = true;
    const raf = requestAnimationFrame(() => {
      listReadyRef.current = true;
      pinToBottom();
      armSettle();
    });
    // Hard cap: never stay hidden longer than 1.2s, even if media keeps loading
    // (slow network). Reveal pinned-to-bottom regardless.
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
  }, [conversationId, rows.length, pinToBottom, armSettle, revealAndClose]);

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

  // Message touch gestures (mobile):
  //  • swipe RIGHT  → reply to the message
  //  • double-tap   → ❤️ reaction
  //  • press & hold → open the reaction row + menu
  const swipeRef = useRef<{ x: number; y: number; el: HTMLElement | null; horiz: boolean }>({
    x: 0,
    y: 0,
    el: null,
    horiz: false,
  });
  const movedRef = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const lastTapRef = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onRowTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>, m: Message) => {
      if (selectionMode) return;
      const t = e.touches[0];
      swipeRef.current = { x: t.clientX, y: t.clientY, el: e.currentTarget, horiz: false };
      movedRef.current = false;
      longPressedRef.current = false;
      clearLongPress();
      const reactable = !isSecret && !m.ephemeral && !m.recalled && !m.deleted;
      if (reactable) {
        const x = t.clientX;
        const y = t.clientY;
        longPressTimer.current = window.setTimeout(() => {
          longPressedRef.current = true;
          const el = swipeRef.current.el;
          if (el) {
            el.style.transform = "";
            el.classList.remove("chat-bubble-row--reply-ready");
          }
          swipeRef.current.el = null;
          try {
            navigator.vibrate?.(15);
          } catch {
            /* no haptics */
          }
          setMenu({ message: m, x, y });
        }, 420);
      }
    },
    [selectionMode, isSecret],
  );

  const onRowTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      movedRef.current = true;
      clearLongPress();
    }
    if (!s.el) return;
    if (!s.horiz) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        s.el = null; // vertical scroll — let the list handle it
        return;
      }
      s.horiz = true;
    }
    const d = Math.max(0, Math.min(dx, 72));
    s.el.style.transition = "none";
    s.el.style.transform = `translateX(${d}px)`;
    s.el.classList.toggle("chat-bubble-row--reply-ready", d >= 52);
  }, []);

  const onRowTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>, m: Message) => {
      clearLongPress();
      const s = swipeRef.current;
      const el = s.el;
      const horiz = s.horiz;
      const moved = movedRef.current;
      swipeRef.current = { x: 0, y: 0, el: null, horiz: false };
      movedRef.current = false;

      if (longPressedRef.current) {
        longPressedRef.current = false;
        return; // the hold already opened the menu
      }

      const reactable = !isSecret && !m.ephemeral && !m.recalled && !m.deleted;

      if (el) {
        const ready = el.classList.contains("chat-bubble-row--reply-ready");
        el.style.transition = "transform 0.18s ease";
        el.style.transform = "";
        el.classList.remove("chat-bubble-row--reply-ready");
        if (horiz) {
          if (ready && reactable) onMenuAction(m, { type: "reply" });
          return;
        }
      }

      // A clean tap (no swipe / no scroll): a second one within 300ms = ❤️.
      // Skip when the tap landed on an interactive element (image, link, poll…)
      // so it doesn't fight with opening media / following a link.
      const interactive = (e.target as HTMLElement | null)?.closest(
        "a, button, img, video, input, select, textarea, label, .poll-message",
      );
      if (!moved && !interactive && !selectionMode && reactable && onToggleReaction) {
        const now = Date.now();
        if (lastTapRef.current.id === m.id && now - lastTapRef.current.t < 300) {
          lastTapRef.current = { id: "", t: 0 };
          onToggleReaction(m.id, "❤️");
        } else {
          lastTapRef.current = { id: m.id, t: now };
        }
      }
    },
    [onMenuAction, onToggleReaction, isSecret, selectionMode],
  );

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
        key={conversationId} destroys and recreates the Virtuoso instance on
        every conversation switch, giving each chat a clean slate with its own
        firstItemIndex / scroll position / measured heights. Combined with
        initialTopMostItemIndex={{ index: last, align: "end" }}, Virtuoso starts
        its FIRST render already at the last message, aligned to the bottom — no
        scrollTo correction needed, no visible jump.
      */}
      {/* Skeleton overlay covers the list while it positions itself to the last
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
        initialTopMostItemIndex={{ index: rows.length - 1, align: "end" }}
        alignToBottom={true}
        followOutput={(atBottom) => (atBottom ? "auto" : false)}
        totalListHeightChanged={() => {
          // Async content (images, link previews, voice/video) and Virtuoso's
          // own height measurement change the total height after first paint.
          // While opening, keep the viewport pinned to the bottom AND restart the
          // settle countdown — the list is only revealed once these stop, so the
          // user never sees the reflow. (load-older is unaffected: it needs the
          // user at the top, impossible while pinned during this window.)
          if (openingRef.current) {
            pinToBottom();
            armSettle();
          }
        }}
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
              onTouchStart={(e) => onRowTouchStart(e, m)}
              onTouchMove={onRowTouchMove}
              onTouchEnd={(e) => onRowTouchEnd(e, m)}
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
              behavior: "auto",
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
