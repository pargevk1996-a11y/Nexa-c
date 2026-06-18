import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { IconButton } from "@/components/ui/IconButton";
import { IconMic, IconSend, IconStop, IconTimer, IconX } from "@/components/icons/Icons";
import { VOICE_AUDIO_CONSTRAINTS } from "@/voice/audioUtils";

const MAX_RECORD_SECONDS = 300;

export interface VoiceRecorderHandle {
  stopAndSend: () => void;
  cancel: () => void;
}

interface VoiceRecorderProps {
  autoStart?: boolean;
  disabled?: boolean;
  /** While true the recording continues hands-free and shows stop/cancel. */
  locked?: boolean;
  /** Visual feedback for the in-progress drag gesture. */
  dragHint?: "none" | "lock" | "cancel";
  /** Disappearing-message toggle, shown once the recording is locked. */
  ephemeral?: boolean;
  onToggleEphemeral?: () => void;
  onRecorded: (durationSeconds: number, blobUrl: string, blob: Blob) => void;
  onCancel: () => void;
}

function LockIcon({ closed }: { closed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d={closed ? "M8 10.5V7.5a4 4 0 0 1 8 0v3" : "M8 10.5V7.5a4 4 0 0 1 7.5-2"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder(
    { autoStart, disabled, locked, dragHint = "none", ephemeral, onToggleEphemeral, onRecorded, onCancel },
    ref,
  ) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [, setPreviewStream] = useState<MediaStream | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const secondsRef = useRef(0);
    const discardRef = useRef(false);
    const startedRef = useRef(false);

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    function releaseStream() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPreviewStream(null);
      recorderRef.current = null;
    }

    function stopRecording(discard: boolean) {
      discardRef.current = discard;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        recorder.stop();
        return;
      }
      releaseStream();
      setRecording(false);
      setSeconds(0);
      if (discard) onCancel();
    }

    useImperativeHandle(ref, () => ({
      stopAndSend: () => stopRecording(false),
      cancel: () => stopRecording(true),
    }));

    async function startRecording() {
      if (disabled || startedRef.current) return;
      startedRef.current = true;
      discardRef.current = false;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: VOICE_AUDIO_CONSTRAINTS,
        });
        streamRef.current = stream;
        setPreviewStream(stream);
        // Prefer Opus (clear voice, good compression) + a solid bitrate so voice
        // notes don't sound muffled. Fall back to whatever the browser supports.
        const preferredMime =
          [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/mp4",
            "audio/webm",
          ].find((t) => {
            try {
              return MediaRecorder.isTypeSupported?.(t);
            } catch {
              return false;
            }
          }) ?? "";
        const recorder = new MediaRecorder(stream, {
          ...(preferredMime ? { mimeType: preferredMime } : {}),
          audioBitsPerSecond: 128000,
        });
        const blobType = preferredMime || "audio/webm";
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          clearTimer();
          const duration = secondsRef.current || 1;
          const shouldDiscard = discardRef.current;
          const blob = new Blob(chunksRef.current, { type: blobType });
          chunksRef.current = [];
          releaseStream();
          setRecording(false);
          setSeconds(0);
          startedRef.current = false;

          if (!shouldDiscard) {
            const url = blob.size > 0 ? URL.createObjectURL(blob) : "";
            onRecorded(duration, url, blob);
          } else {
            onCancel();
          }
        };

        recorder.start(200);
        recorderRef.current = recorder;
        setRecording(true);
        setSeconds(0);
        secondsRef.current = 0;

        timerRef.current = window.setInterval(() => {
          setSeconds((s) => {
            const next = s + 1;
            secondsRef.current = next;
            if (next >= MAX_RECORD_SECONDS) {
              stopRecording(false);
            }
            return next;
          });
        }, 1000);
      } catch {
        startedRef.current = false;
        setRecording(false);
        onCancel();
      }
    }

    useEffect(() => {
      if (autoStart) void startRecording();
      return () => {
        clearTimer();
        const recorder = recorderRef.current;
        if (recorder && recorder.state === "recording") {
          discardRef.current = true;
          try {
            recorder.requestData();
          } catch {
            /* ignore */
          }
          recorder.stop();
        } else {
          releaseStream();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleCancel(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      stopRecording(true);
    }

    function handleSend(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      stopRecording(false);
    }

    if (!recording && !startedRef.current) {
      if (!autoStart) {
        return (
          <IconButton
            label="Record voice message"
            variant="ghost"
            disabled={disabled}
            onClick={() => void startRecording()}
          >
            <IconMic size={20} />
          </IconButton>
        );
      }
      return <span className="voice-recorder__time">Starting…</span>;
    }

    if (!recording) {
      return <span className="voice-recorder__time">Starting…</span>;
    }

    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");

    return (
      <div
        className={`voice-recorder voice-recorder--active ${locked ? "voice-recorder--locked" : ""} ${
          dragHint === "cancel" ? "voice-recorder--cancelling" : ""
        }`}
      >
        <span className="voice-recorder__dot" aria-hidden />
        <span className="voice-recorder__time">{mm}:{ss}</span>
        {locked ? (
          <>
            <span className="voice-recorder__hint voice-recorder__hint--grow">Recording…</span>
            <span className="voice-recorder__lock voice-recorder__lock--closed" aria-hidden title="Locked">
              <LockIcon closed />
            </span>
            {onToggleEphemeral ? (
              <IconButton
                label="Disappearing voice message"
                variant="ghost"
                className={ephemeral ? "icon-btn--active" : undefined}
                onClick={onToggleEphemeral}
              >
                <IconTimer size={18} />
              </IconButton>
            ) : null}
            <IconButton label="Cancel recording" variant="ghost" onClick={handleCancel}>
              <IconX size={18} />
            </IconButton>
            <IconButton label="Stop — review voice message" variant="primary" onClick={handleSend}>
              <IconStop size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <span className="voice-recorder__hint voice-recorder__hint--grow">
              {dragHint === "cancel"
                ? "Release to cancel"
                : dragHint === "lock"
                  ? "Release to lock"
                  : "‹ slide to cancel"}
            </span>
            {/* Impulse on the right (where the button was). */}
            <span className="voice-mrt" aria-hidden />
            {/* Lock floats ABOVE the send button — slide up to it. */}
            <span
              className={`voice-recorder__lock voice-recorder__lock--float ${dragHint === "lock" ? "is-near" : ""}`}
              aria-hidden
              title="Slide up to lock"
            >
              <LockIcon />
              <span className="voice-recorder__lock-arrow" aria-hidden>⌃</span>
            </span>
          </>
        )}
      </div>
    );
  },
);
