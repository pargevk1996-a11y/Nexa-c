import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { AudioWaveform } from "@/components/voice/AudioWaveform";
import { IconButton } from "@/components/ui/IconButton";
import { IconMic, IconSend, IconStop } from "@/components/icons/Icons";
import { VOICE_AUDIO_CONSTRAINTS } from "@/voice/audioUtils";

const MAX_RECORD_SECONDS = 300;

export interface VoiceRecorderHandle {
  stopAndSend: () => void;
  cancel: () => void;
}

interface VoiceRecorderProps {
  autoStart?: boolean;
  disabled?: boolean;
  onRecorded: (durationSeconds: number, blobUrl: string, blob: Blob) => void;
  onCancel: () => void;
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder({ autoStart, disabled, onRecorded, onCancel }, ref) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

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
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          clearTimer();
          const duration = secondsRef.current || 1;
          const shouldDiscard = discardRef.current;
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
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
      <div className="voice-recorder voice-recorder--active">
        <span className="voice-recorder__dot" aria-hidden />
        <AudioWaveform stream={previewStream} active className="voice-recorder__wave" />
        <span className="voice-recorder__time">{mm}:{ss}</span>
        <IconButton label="Cancel recording" variant="ghost" onClick={handleCancel}>
          <IconStop size={18} />
        </IconButton>
        <IconButton label="Send voice message" variant="primary" onClick={handleSend}>
          <IconSend size={18} />
        </IconButton>
      </div>
    );
  },
);
