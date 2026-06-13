import { useEffect, useRef, useState } from "react";
import { WaveformBars } from "@/components/voice/WaveformBars";
import { IconButton } from "@/components/ui/IconButton";
import { IconPause, IconPlay } from "@/components/icons/Icons";
import { cacheSignedUrl, getCachedSignedUrl, resolveBlobUrl } from "@/media/mediaCache";
import { getMediaUrls } from "@/api/media";
import { useBackgroundPlayback } from "@/media/useBackgroundPlayback";
import {
  extractWaveformPeaks,
  formatVoiceDuration,
  nextPlaybackSpeed,
  type PlaybackSpeed,
} from "@/voice/audioUtils";
import type { Message } from "@/types";

interface VoiceMessageProps {
  message: Message;
}

export function VoiceMessage({ message }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [peaks, setPeaks] = useState<number[]>(
    message.voiceWaveform ?? Array.from({ length: 28 }, (_, i) => 0.2 + ((i * 11) % 60) / 100),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const duration = message.voiceDuration ?? 0;

  useBackgroundPlayback(activeAudio, playing);

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (message.voiceUrl) {
        if (!cancelled) setResolvedUrl(message.voiceUrl);
        return;
      }
      if (message.mediaId) {
        const cached = getCachedSignedUrl(message.mediaId);
        if (cached) {
          if (!cancelled) setResolvedUrl(cached);
          return;
        }
      }
      if (message.streamUrl) {
        if (!cancelled) setResolvedUrl(message.streamUrl);
        return;
      }
      // Recipient (and the sender after a reload) only has the media id — fetch
      // a fresh signed URL so the clip is actually playable. Without this the
      // voice message stays silent.
      if (message.mediaId) {
        try {
          const urls = await getMediaUrls(message.mediaId);
          cacheSignedUrl(message.mediaId, urls.stream_url, urls.expires_in);
          if (!cancelled) {
            setResolvedUrl(urls.stream_url);
            return;
          }
        } catch {
          /* fall through to any locally cached blob */
        }
      }
      const fromStore = await resolveBlobUrl(`msg:${message.id}`);
      if (!cancelled) setResolvedUrl(fromStore);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [message.id, message.mediaId, message.streamUrl, message.voiceUrl]);

  function stopPlayback() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }
    setActiveAudio(null);
    setPlaying(false);
    setProgress(0);
  }

  useEffect(() => {
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (message.voiceWaveform?.length) {
      setPeaks(message.voiceWaveform);
    }
  }, [message.voiceWaveform]);

  async function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }

    const url = resolvedUrl;
    if (!url) {
      setPlaying(true);
      return;
    }

    const audio = new Audio(url);
    audio.playbackRate = speed;
    audioRef.current = audio;
    setActiveAudio(audio);

    if (!message.voiceWaveform?.length) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const extracted = await extractWaveformPeaks(blob, peaks.length);
        setPeaks(extracted);
      } catch {
        /* keep placeholder peaks */
      }
    }

    audio.onended = () => stopPlayback();
    audio.onerror = () => stopPlayback();
    setPlaying(true);
    await audio.play().catch(() => stopPlayback());

    const tick = () => {
      if (!audioRef.current) return;
      const d = audioRef.current.duration || duration || 1;
      setProgress(Math.min(1, audioRef.current.currentTime / d));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function cycleSpeed() {
    const next = nextPlaybackSpeed(speed);
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className={`voice-msg ${message.outgoing ? "voice-msg--out" : "voice-msg--in"}`}>
      <IconButton
        label={playing ? "Pause" : "Play voice message"}
        variant="ghost"
        className="voice-msg__play"
        onClick={() => void togglePlay()}
      >
        {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
      </IconButton>
      <WaveformBars peaks={peaks} active={playing} progress={progress} />
      <span className="voice-msg__dur">{formatVoiceDuration(duration)}</span>
      <button
        type="button"
        className="voice-msg__speed"
        title="Playback speed"
        onClick={cycleSpeed}
      >
        {speed}x
      </button>
    </div>
  );
}
