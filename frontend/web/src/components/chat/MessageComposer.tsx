import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ContextMessage } from "@/api/ai";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/chat/VoiceRecorder";
import { VideoNoteRecorder, type VideoNoteRecorderHandle } from "@/components/chat/VideoNoteRecorder";
import { SmartReplyBar } from "@/components/ai/SmartReplyBar";
import { useSmartReply } from "@/ai/useSmartReply";
import {
  IconMic,
  IconPaperclip,
  IconPause,
  IconPlay,
  IconSend,
  IconSmile,
  IconSpeaker,
  IconSpeakerOff,
  IconTimer,
  IconVideo,
  IconX,
} from "@/components/icons/Icons";

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
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
  // false = voice note, true = video note — toggled by tapping send when empty
  const [videoMode, setVideoMode] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  // Voice/video gesture: hold the send button (when the field is empty) to record.
  // Slide up locks; slide left cancels; on release → auto-send (or review if locked).
  const [recordLocked, setRecordLocked] = useState(false);
  const [dragHint, setDragHint] = useState<"none" | "lock" | "cancel">("none");
  const [reviewVoice, setReviewVoice] = useState<{ url: string; blob: Blob; duration: number } | null>(null);
  const [reviewVideo, setReviewVideo] = useState<{ url: string; blob: Blob; duration: number } | null>(null);
  const [reviewPlaying, setReviewPlaying] = useState(false);
  const voiceRecorderRef = useRef<VoiceRecorderHandle>(null);
  const videoRecorderRef = useRef<VideoNoteRecorderHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  // Pointer-gesture bookkeeping for the send / hold-to-record button.
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const lockedRef = useRef(false);
  const cancelRef = useRef(false);
  const longPressedRef = useRef(false);

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

  // Recording finished.
  // Non-locked (hold-release) → auto-send immediately.
  // Locked (user slid up) → hold in review so user presses send manually.
  function handleVoiceRecorded(duration: number, url: string, blob: Blob) {
    const wasLocked = lockedRef.current;
    setRecordingMode(false);
    setRecordLocked(false);
    recordingRef.current = false;
    lockedRef.current = false;
    if (blob.size > 0 && url) {
      if (wasLocked) {
        setReviewVoice({ url, blob, duration });
      } else {
        onSendVoice(duration, url, blob, sendOpts());
      }
    }
  }

  function handleVideoRecorded(duration: number, url: string, blob: Blob) {
    const wasLocked = lockedRef.current;
    setRecordingMode(false);
    setRecordLocked(false);
    recordingRef.current = false;
    lockedRef.current = false;
    if (blob.size > 0 && url) {
      if (wasLocked) {
        setReviewVideo({ url, blob, duration });
      } else {
        dispatchVideoNote(blob);
      }
    }
  }

  function dispatchVideoNote(blob: Blob) {
    const file = new File([blob], `vidnote-${Date.now()}.webm`, {
      type: blob.type || "video/webm",
    });
    if (onSendFile) {
      onSendFile(file, { ...sendOpts(), videoNote: true });
    }
  }

  function discardVoiceReview() {
    if (reviewVoice?.url) URL.revokeObjectURL(reviewVoice.url);
    setReviewVoice(null);
    setReviewPlaying(false);
  }

  function sendVoiceReview() {
    if (!reviewVoice) return;
    onSendVoice(reviewVoice.duration, reviewVoice.url, reviewVoice.blob, sendOpts());
    setReviewVoice(null);
    setReviewPlaying(false);
    setEphemeralMode(false);
  }

  function discardVideoReview() {
    if (reviewVideo?.url) URL.revokeObjectURL(reviewVideo.url);
    setReviewVideo(null);
    setReviewPlaying(false);
  }

  function sendVideoReview() {
    if (!reviewVideo) return;
    dispatchVideoNote(reviewVideo.blob);
    if (reviewVideo.url) URL.revokeObjectURL(reviewVideo.url);
    setReviewVideo(null);
    setReviewPlaying(false);
    setEphemeralMode(false);
  }

  function toggleReviewPlay() {
    const el = reviewAudioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setReviewPlaying(true);
    } else {
      el.pause();
      setReviewPlaying(false);
    }
  }

  // ── Hold-to-record / hold-to-arm-ephemeral gesture on the send button ──
  // (window listeners use per-gesture local closures so add/remove always
  //  reference the same function, avoiding listener leaks across re-renders.)
  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onSendPointerDown(e: React.PointerEvent) {
    if (disabled || isEditing) return;
    if (reviewVoice || recordLocked) return; // handled by their own controls
    const LOCK_DY = 64;
    const CANCEL_DX = 70;
    const start = { x: e.clientX, y: e.clientY, t: Date.now() };
    pressRef.current = start;
    cancelRef.current = false;
    longPressedRef.current = false;
    const hasText = text.trim().length > 0;

    const cleanup = () => {
      clearHoldTimer();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      pressRef.current = null;
      setDragHint("none");
    };
    const move = (ev: PointerEvent) => {
      if (!recordingRef.current || lockedRef.current) return;
      const dy = start.y - ev.clientY;
      const dx = start.x - ev.clientX;
      if (dx > CANCEL_DX) {
        cancelRef.current = true;
        voiceRecorderRef.current?.cancel();
        recordingRef.current = false;
        setRecordingMode(false);
        cleanup();
        return;
      }
      if (dy > LOCK_DY) {
        lockedRef.current = true;
        setRecordLocked(true);
        cleanup();
        return;
      }
      setDragHint(dy > 24 ? "lock" : dx > 24 ? "cancel" : "none");
    };
    const up = () => {
      const held = Date.now() - start.t;
      if (recordingRef.current && !lockedRef.current && !cancelRef.current) {
        if (held >= 400) {
          // Release after meaningful hold → stop and auto-send (or review if locked)
          if (videoMode) {
            videoRecorderRef.current?.stopAndSend();
          } else {
            voiceRecorderRef.current?.stopAndSend();
          }
        } else {
          // Too short tap while recording started → cancel
          if (videoMode) {
            videoRecorderRef.current?.cancel();
          } else {
            voiceRecorderRef.current?.cancel();
          }
          setRecordingMode(false);
          recordingRef.current = false;
        }
      } else if (!recordingRef.current && hasText && !longPressedRef.current) {
        submit(); // plain tap with text
      } else if (!recordingRef.current && !hasText && !longPressedRef.current) {
        // Quick tap on empty field → toggle voice/video mode
        setVideoMode((v) => !v);
      }
      cleanup();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    if (hasText) {
      // Long-press text → arm "disappearing" mode (don't send on that release).
      holdTimerRef.current = window.setTimeout(() => {
        longPressedRef.current = true;
        setEphemeralMode((v) => !v);
      }, 550);
    } else {
      // Empty field → press-and-hold starts a voice recording (small delay so a
      // quick tap doesn't trigger the mic permission prompt).
      holdTimerRef.current = window.setTimeout(() => {
        recordingRef.current = true;
        lockedRef.current = false;
        setRecordLocked(false);
        setRecordingMode(true);
      }, 280);
    }
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
    // Don't auto-open the on-screen keyboard on phones/touch — only auto-focus
    // on desktop for convenience. (User: the keyboard must not open by itself.)
    if (window.matchMedia?.("(max-width: 768px)").matches) return;
    const t = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [conversationId, disabled, recordingMode, selectionMode, isEditing]);

  // Single-line input: the field never grows vertically. Long text stays on one
  // line and scrolls horizontally (see .chat-composer__input in CSS).

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
          <IconSpeakerOff size={16} />
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
          ) : reviewVideo ? (
            <div className="voice-review video-note-review">
              <button
                type="button"
                className="icon-btn icon-btn--ghost voice-review__del"
                aria-label="Delete video note"
                title="Delete"
                onClick={discardVideoReview}
              >
                <IconX size={18} />
              </button>
              <video
                className="video-note-review__thumb"
                src={reviewVideo.url}
                playsInline
                muted
                onClick={toggleReviewPlay}
                aria-label={reviewPlaying ? "Pause" : "Play video note preview"}
              />
              <span className="voice-review__time">{fmtDur(reviewVideo.duration)}</span>
              <button
                type="button"
                className="icon-btn icon-btn--primary chat-composer__send"
                aria-label="Send video note"
                title="Send"
                onClick={sendVideoReview}
              >
                <IconSend size={18} />
              </button>
              <audio ref={reviewAudioRef} src={reviewVideo.url} onEnded={() => setReviewPlaying(false)} hidden />
            </div>
          ) : reviewVoice ? (
            <div className="voice-review">
              <button
                type="button"
                className="icon-btn icon-btn--ghost voice-review__del"
                aria-label="Delete recording"
                title="Delete"
                onClick={discardVoiceReview}
              >
                <IconX size={18} />
              </button>
              <button
                type="button"
                className="icon-btn voice-review__play"
                aria-label={reviewPlaying ? "Pause" : "Play"}
                onClick={toggleReviewPlay}
              >
                {reviewPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
              </button>
              <span className="voice-review__bar" aria-hidden>
                <span className={`voice-review__fill ${reviewPlaying ? "is-playing" : ""}`} />
              </span>
              <span className="voice-review__time">{fmtDur(reviewVoice.duration)}</span>
              {!isSecret ? (
                <button
                  type="button"
                  className={`icon-btn icon-btn--ghost ${ephemeralMode ? "icon-btn--active" : ""}`}
                  aria-label="Send as disappearing voice message"
                  onClick={() => setEphemeralMode((v) => !v)}
                >
                  <IconTimer size={20} />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn icon-btn--primary chat-composer__send"
                aria-label="Send voice message"
                title="Send"
                onClick={sendVoiceReview}
              >
                <IconSend size={18} />
              </button>
              <audio
                ref={reviewAudioRef}
                src={reviewVoice.url}
                onEnded={() => setReviewPlaying(false)}
                hidden
              />
            </div>
          ) : recordingMode ? (
            videoMode ? (
              <VideoNoteRecorder
                ref={videoRecorderRef}
                autoStart
                disabled={disabled}
                locked={recordLocked}
                dragHint={dragHint}
                onRecorded={(dur, url, blob) => handleVideoRecorded(dur, url, blob)}
                onCancel={() => {
                  setRecordingMode(false);
                  setRecordLocked(false);
                  recordingRef.current = false;
                  lockedRef.current = false;
                }}
              />
            ) : (
              <VoiceRecorder
                ref={voiceRecorderRef}
                autoStart
                disabled={disabled}
                locked={recordLocked}
                dragHint={dragHint}
                ephemeral={ephemeralMode}
                onToggleEphemeral={isSecret ? undefined : () => setEphemeralMode((v) => !v)}
                onRecorded={(dur, url, blob) => handleVoiceRecorded(dur, url, blob)}
                onCancel={() => {
                  setRecordingMode(false);
                  setRecordLocked(false);
                  recordingRef.current = false;
                  lockedRef.current = false;
                }}
              />
            )
          ) : (
            <>
              {/* Accessory buttons stay visible at all times — emoji, attach and
                  the notification toggle remain available while typing. */}
              <>
                  {!isSecret ? (
                    <button
                      type="button"
                      className={`icon-btn icon-btn--ghost chat-composer__silent ${silentMode ? "chat-composer__silent--muted" : ""}`}
                      disabled={disabled || isEditing}
                      aria-label={silentMode ? "Notifications off — will send silently" : "Send with notification"}
                      onClick={() => setSilentMode((v) => !v)}
                    >
                      {silentMode ? <IconSpeakerOff size={20} /> : <IconSpeaker size={20} />}
                    </button>
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
              </>
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
              {isEditing ? (
                <IconButton label="Save edit" variant="primary" disabled={disabled || !text.trim()} onClick={submit}>
                  <IconSend size={18} />
                </IconButton>
              ) : (
                <button
                  type="button"
                  className={`icon-btn icon-btn--primary chat-composer__send${ephemeralMode ? " chat-composer__send--ephemeral" : ""}${text.trim() ? "" : videoMode ? " chat-composer__send--video" : " chat-composer__send--voice"}`}
                  disabled={disabled}
                  aria-label={text.trim() ? "Send message" : videoMode ? "Tap to switch to voice · Hold to record video note" : "Tap to switch to video · Hold to record voice message"}
                  onPointerDown={onSendPointerDown}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {text.trim() ? (
                    <span className="typing-dots" aria-hidden>
                      <span /><span /><span />
                    </span>
                  ) : videoMode ? (
                    <span className="send-mode-icon" aria-hidden><IconVideo size={20} /></span>
                  ) : (
                    <span className="send-mode-icon" aria-hidden><IconMic size={20} /></span>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </form>
  );
}
