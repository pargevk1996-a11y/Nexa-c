import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ContextMessage } from "@/api/ai";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/chat/VoiceRecorder";
import { SmartReplyBar } from "@/components/ai/SmartReplyBar";
import { useSmartReply } from "@/ai/useSmartReply";
import {
  IconBell,
  IconMic,
  IconPaperclip,
  IconSend,
  IconSmile,
  IconTimer,
  IconX,
} from "@/components/icons/Icons";
import type { Message } from "@/types";
import { replySenderLabel, replySnippet } from "@/utils/messageLayout";
import type { DemoGif, DemoSticker } from "@/data/mockMedia";
import { IconButton } from "@/components/ui/IconButton";
import { FileAttachButton } from "@/components/ui/FileAttachButton";
import { features } from "@/features/registry";
import { useSettings } from "@/store/SettingsContext";
import { useChatOptional } from "@/store/ChatContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { EPHEMERAL_VIEW_SECONDS } from "@/utils/ephemeral";
import { COMPOSER_ATTACH_ACCEPT } from "@/utils/files";

export interface SendOptions {
  ephemeral?: boolean;
  replyTo?: Message;
  silent?: boolean;
  scheduledAt?: string;
  videoNote?: boolean;
}

interface MessageComposerProps {
  conversationId: string | null;
  onSend: (text: string, options?: SendOptions) => void;
  onSendVoice: (
    durationSeconds: number,
    blobUrl: string,
    blob: Blob,
    options?: SendOptions,
  ) => void;
  onSendFile?: (file: File, options?: SendOptions) => void;
  recentMessages?: ContextMessage[];
  isSecret?: boolean;
  secureMode?: boolean;
  disabled?: boolean;
  /** Shown when composer is read-only (e.g. broadcast channel) */
  readOnlyHint?: string;
  initialText?: string;
  onDraftChange?: (text: string) => void;
  selectionMode?: boolean;
  editingText?: string | null;
  onSaveEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  replyingTo?: Message | null;
  replyPeerName?: string;
  onCancelReply?: () => void;
  onSendGif?: (gif: DemoGif) => void;
  onSendSticker?: (sticker: DemoSticker) => void;
}

export function MessageComposer({
  conversationId,
  onSend,
  onSendVoice,
  onSendFile,
  recentMessages = [],
  isSecret,
  secureMode,
  disabled,
  readOnlyHint,
  initialText,
  onDraftChange,
  selectionMode,
  editingText,
  onSaveEdit,
  onCancelEdit,
  replyingTo,
  replyPeerName = "Peer",
  onCancelReply,
  onSendGif,
  onSendSticker,
}: MessageComposerProps) {
  const { settings } = useSettings();
  const chat = useChatOptional();
  const { onInputActivity, stopTyping } = useTypingIndicator(
    conversationId,
    chat?.sendTyping,
    Boolean(features.chat.realtime && !disabled && !isSecret),
  );
  const [text, setText] = useState(initialText ?? "");
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => { onDraftChangeRef.current?.(text); }, [text]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pickerSection, setPickerSection] = useState<"emoji" | "gif" | "sticker">("emoji");
  const [recordingMode, setRecordingMode] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  const voiceRecorderRef = useRef<VoiceRecorderHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  const aiOn = features.ai && !isSecret;
  const { suggestions, loading: replyLoading, clear: clearReplies } = useSmartReply(
    conversationId,
    recentMessages,
    aiOn && !editingText,
  );

  const isEditing = editingText != null;
  const sendOpts = (): SendOptions | undefined => {
    const opts: SendOptions = {};
    if (ephemeralMode) opts.ephemeral = true;
    if (silentMode) opts.silent = true;
    return Object.keys(opts).length ? opts : undefined;
  };

  useEffect(() => {
    if (editingText != null) {
      setText(editingText);
      setRecordingMode(false);
      setEmojiOpen(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingText]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (isEditing && onSaveEdit) {
      onSaveEdit(trimmed);
    setText("");
    clearReplies();
    stopTyping();
    return;
  }
    onSend(trimmed, {
      ...sendOpts(),
      replyTo: replyingTo ?? undefined,
    });
    setText("");
    clearReplies();
    stopTyping();
  }

  async function handleVoiceRecorded(duration: number, url: string, blob: Blob) {
    onSendVoice(duration, url, blob, sendOpts());
    setRecordingMode(false);
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  useEffect(() => {
    if (!conversationId || disabled || recordingMode || selectionMode || isEditing) return;
    const t = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [conversationId, disabled, recordingMode, selectionMode, isEditing]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (settings.enterToSend && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  const showSmartReply = aiOn && !isEditing && !selectionMode && !recordingMode;

  return (
    <form className="chat-composer" onSubmit={handleSubmit} noValidate>
      {readOnlyHint && disabled && !selectionMode && !isEditing ? (
        <p className="chat-composer__readonly-hint" role="status">
          {readOnlyHint}
        </p>
      ) : null}
      {isEditing ? (
        <div className="chat-composer__edit-banner">
          <span>Editing message</span>
          <button type="button" onClick={() => { setText(""); onCancelEdit?.(); }}>
            Cancel
          </button>
        </div>
      ) : replyingTo ? (
        <div className="chat-composer__reply-banner">
          <div className="chat-composer__reply-banner-body">
            <span className="chat-composer__reply-label">
              Reply to {replySenderLabel(replyingTo, replyPeerName)}
            </span>
            <span className="chat-composer__reply-snippet">
              {replySnippet(replyingTo, replyPeerName)}
            </span>
          </div>
          <button type="button" className="chat-composer__reply-dismiss" onClick={onCancelReply} aria-label="Cancel reply">
            <IconX size={18} />
          </button>
        </div>
      ) : null}
      {ephemeralMode && !isSecret ? (
        <div className="chat-composer__ephemeral-banner" role="status">
          <IconTimer size={16} />
          <span>
            Disappearing mode — everything you send is deleted {EPHEMERAL_VIEW_SECONDS}s after viewing
          </span>
        </div>
      ) : null}
      {silentMode && !isSecret ? (
        <div className="chat-composer__silent-banner" role="status">
          <IconBell size={16} />
          <span>Send without notification sound</span>
        </div>
      ) : null}
      {showSmartReply && features.ai ? (
        <SmartReplyBar
          suggestions={suggestions}
          loading={replyLoading}
          onPick={(s) => {
            setText(s);
            textareaRef.current?.focus();
          }}
        />
      ) : null}
      <div className="chat-composer__wrap">
        <EmojiPicker
          open={emojiOpen}
          initialSection={pickerSection}
          onClose={() => setEmojiOpen(false)}
          onSelect={insertEmoji}
          onGifSelect={(gif: DemoGif) => {
            onSendGif?.(gif);
            setEmojiOpen(false);
          }}
          onStickerSelect={(st: DemoSticker) => {
            onSendSticker?.(st);
            setEmojiOpen(false);
          }}
          allowGif={!isSecret && Boolean(onSendGif) && features.chat.stickers}
          allowStickers={!isSecret && Boolean(onSendSticker) && features.chat.stickers}
          anchorRef={emojiBtnRef}
        />
        <div className="chat-composer__inner">
          {selectionMode ? (
            <p className="chat-composer__hint">Tap messages to select them</p>
          ) : recordingMode ? (
            <VoiceRecorder
              ref={voiceRecorderRef}
              autoStart
              disabled={disabled}
              onRecorded={(dur, url, blob) => void handleVoiceRecorded(dur, url, blob)}
              onCancel={() => setRecordingMode(false)}
            />
          ) : (
            <>
              {!isSecret ? (
                <>
                  <button
                    type="button"
                    className={`icon-btn icon-btn--ghost ${ephemeralMode ? "icon-btn--active" : ""}`}
                    disabled={disabled || isEditing}
                    aria-label="Toggle disappearing messages"
                    title={`Disappearing messages — vanish ${EPHEMERAL_VIEW_SECONDS}s after viewing`}
                    onClick={() => setEphemeralMode((v) => !v)}
                  >
                    <IconTimer size={20} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn icon-btn--ghost ${silentMode ? "icon-btn--active" : ""}`}
                    disabled={disabled || isEditing}
                    aria-label="Send silently"
                    title="Send without notification"
                    onClick={() => setSilentMode((v) => !v)}
                  >
                    <IconBell size={20} />
                  </button>
                </>
              ) : null}
              {!isSecret && onSendFile ? (
                <FileAttachButton
                  label={secureMode ? "Attach photo, video or audio (SecureChat)" : "Attach photo, video, or file"}
                  accept={secureMode ? "image/*,video/*,audio/*" : COMPOSER_ATTACH_ACCEPT}
                  disabled={disabled || isEditing}
                  multiple
                  onFiles={(list) => {
                    Array.from(list).forEach((file) => {
                      if (secureMode) {
                        const ok = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
                        if (!ok) return;
                      }
                      onSendFile(file, sendOpts());
                    });
                  }}
                  className="icon-btn icon-btn--ghost"
                >
                  <IconPaperclip size={20} />
                </FileAttachButton>
              ) : null}
              {!isSecret ? (
                <IconButton
                  label="Record voice message"
                  variant="ghost"
                  disabled={disabled || isEditing}
                  onClick={() => setRecordingMode(true)}
                >
                  <IconMic size={20} />
                </IconButton>
              ) : null}
              <button
                ref={emojiBtnRef}
                type="button"
                className={`icon-btn icon-btn--ghost ${emojiOpen ? "icon-btn--active" : ""}`}
                disabled={disabled}
                aria-label="Emoji, GIF and stickers"
                title="Emoji, GIF and stickers"
                onClick={() => setEmojiOpen((o) => !o)}
              >
                <IconSmile size={20} />
              </button>
              <textarea
                ref={textareaRef}
                className="chat-composer__input"
                rows={1}
                placeholder={
                  disabled && readOnlyHint
                    ? "Read-only channel"
                    : isEditing
                      ? "Edit message…"
                      : ephemeralMode
                        ? "Disappearing message…"
                        : isSecret
                          ? "Secret message (text only)…"
                          : secureMode
                            ? "SecureChat — no copy, no download…"
                            : "Type a message…"
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onInputActivity();
                }}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                aria-label="Message text"
              />
              <IconButton
                label={isEditing ? "Save edit" : "Send message"}
                variant="primary"
                disabled={disabled || !text.trim()}
                onClick={submit}
              >
                <IconSend size={18} />
              </IconButton>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
