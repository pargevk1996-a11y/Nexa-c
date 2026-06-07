import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

interface ContextState {
  message: Message;
  x: number;
  y: number;
}

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
}: MessageListProps) {
  const [menu, setMenu] = useState<ContextState | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const prevConversationIdRef = useRef<string | undefined>(conversationId);

  const rows = useMemo(() => buildMessageRows(messages), [messages]);
  const galleryImages = useMemo(() => collectGalleryImages(messages), [messages]);

  const openGallery = useCallback(
    (messageId: string) => {
      const idx = galleryImages.findIndex((g) => g.messageId === messageId);
      if (idx >= 0) setGalleryIndex(idx);
    },
    [galleryImages],
  );

  useEffect(() => {
    setGalleryIndex(null);
  }, [conversationId]);

  // Scroll to bottom on conversation switch
  useEffect(() => {
    if (conversationId === prevConversationIdRef.current) return;
    prevConversationIdRef.current = conversationId;
    virtuosoRef.current?.scrollToIndex({ index: rows.length - 1, behavior: "auto" });
  }, [conversationId, rows.length]);

  // Scroll to bottom when new messages arrive and user is already at bottom
  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({ index: rows.length - 1, behavior: "smooth" });
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

  if (loading) {
    return <MessageListSkeleton />;
  }

  if (messages.length === 0) {
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
    <>
      <Virtuoso
        ref={virtuosoRef}
        className={`chat-messages ${isSecret ? "chat-messages--secret" : "chat-messages--copy-ok"}`}
        role="log"
        aria-live="polite"
        data={rows}
        initialTopMostItemIndex={rows.length - 1}
        followOutput="smooth"
        overscan={400}
        atBottomStateChange={(atBottom) => {
          if (atBottom) onAtBottom?.();
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
          );
        }}
      />
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
    </>
  );
}
