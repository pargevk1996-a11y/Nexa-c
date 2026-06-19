import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { IconStop, IconX } from "@/components/icons/Icons";
import { VOICE_AUDIO_CONSTRAINTS } from "@/voice/audioUtils";

const MAX_RECORD_SECONDS = 300;
const RING_R = 90;
const RING_C = 2 * Math.PI * RING_R;

export interface VideoNoteRecorderHandle {
  stopAndSend: () => void;
  cancel: () => void;
}

interface VideoNoteRecorderProps {
  autoStart?: boolean;
  disabled?: boolean;
  locked?: boolean;
  dragHint?: "none" | "lock" | "cancel";
  onRecorded: (durationSeconds: number, blobUrl: string, blob: Blob) => void;
  onCancel: () => void;
}

function LockIcon({ closed }: { closed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d={closed ? "M8 10.5V7.5a4 4 0 0 1 8 0v3" : "M8 10.5V7.5a4 4 0 0 1 7.5-2"}
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      />
    </svg>
  );
}

export const VideoNoteRecorder = forwardRef<VideoNoteRecorderHandle, VideoNoteRecorderProps>(
  function VideoNoteRecorder(
    { autoStart, disabled, locked, dragHint = "none", onRecorded, onCancel },
    ref,
  ) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const previewRef = useRef<HTMLVideoElement>(null);
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
      recorderRef.current = null;
      if (previewRef.current) previewRef.current.srcObject = null;
    }

    function stopRecording(discard: boolean) {
      discardRef.current = discard;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try { recorder.requestData(); } catch { /* ignore */ }
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
          video: { width: { ideal: 720 }, height: { ideal: 720 }, facingMode: "user" },
          audio: VOICE_AUDIO_CONSTRAINTS,
        });
        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          void previewRef.current.play().catch(() => undefined);
        }

        const preferredMime = [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ].find((t) => { try { return MediaRecorder.isTypeSupported?.(t); } catch { return false; } }) ?? "";
        const blobType = preferredMime || "video/webm";
        const recorder = new MediaRecorder(stream, {
          ...(preferredMime ? { mimeType: preferredMime } : {}),
          videoBitsPerSecond: 1_500_000,
          audioBitsPerSecond: 64_000,
        });
        chunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
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
            if (next >= MAX_RECORD_SECONDS) stopRecording(false);
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
          try { recorder.requestData(); } catch { /* ignore */ }
          recorder.stop();
        } else {
          releaseStream();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    const dashOffset = RING_C * (1 - Math.min(seconds / MAX_RECORD_SECONDS, 1));

    return (
      <>
        {/* Fixed circle overlay — shows live camera above the composer */}
        <div
          className={`vidnote-recorder${recording ? " vidnote-recorder--active" : ""}${locked ? " vidnote-recorder--locked" : ""}${dragHint === "cancel" ? " vidnote-recorder--cancelling" : ""}`}
          aria-label="Video note preview"
        >
          <video
            ref={previewRef}
            className="vidnote-recorder__preview"
            playsInline
            muted
            autoPlay
          />
          {recording && (
            <>
              <svg className="vidnote-recorder__ring" viewBox="0 0 200 200" aria-hidden>
                <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
                <circle
                  cx="100" cy="100" r={RING_R} fill="none"
                  stroke="var(--accent, #4f8cff)" strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="vidnote-recorder__hud">
                <span className="vidnote-recorder__dot" aria-hidden />
                <span className="vidnote-recorder__timer">{mm}:{ss}</span>
              </div>
            </>
          )}
        </div>

        {/* Inline bar inside the composer */}
        <div
          className={`voice-recorder voice-recorder--active voice-recorder--video${locked ? " voice-recorder--locked" : ""}${dragHint === "cancel" ? " voice-recorder--cancelling" : ""}`}
        >
          {!recording ? (
            <span className="voice-recorder__time">Starting…</span>
          ) : (
            <>
              <span className="voice-recorder__dot" aria-hidden />
              <span className="voice-recorder__time">{mm}:{ss}</span>
              {locked ? (
                <>
                  <span className="voice-recorder__hint voice-recorder__hint--grow">Recording…</span>
                  <span className="voice-recorder__lock voice-recorder__lock--closed" aria-hidden title="Locked">
                    <LockIcon closed />
                  </span>
                  <IconButton label="Cancel" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopRecording(true); }}>
                    <IconX size={18} />
                  </IconButton>
                  <IconButton label="Stop and send video note" variant="primary" onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopRecording(false); }}>
                    <IconStop size={18} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span className="voice-recorder__hint voice-recorder__hint--grow">
                    {dragHint === "cancel" ? "Release to cancel" : dragHint === "lock" ? "Release to lock" : "‹ slide to cancel"}
                  </span>
                  <span className="vidnote-mrt" aria-hidden />
                  <span
                    className={`voice-recorder__lock voice-recorder__lock--float${dragHint === "lock" ? " is-near" : ""}`}
                    aria-hidden title="Slide up to lock"
                  >
                    <LockIcon />
                    <span className="voice-recorder__lock-arrow" aria-hidden>⌃</span>
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </>
    );
  },
);
