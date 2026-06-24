import { useCallback, useEffect, useRef, useState } from "react";
import { getMediaUrls } from "@/api/media";
import { IconButton } from "@/components/ui/IconButton";
import { IconPause, IconPlay } from "@/components/icons/Icons";
import { getCachedPreviewUrl, getCachedSignedUrl, cachePreviewUrl, cacheSignedUrl } from "@/media/mediaCache";
import { formatVoiceDuration } from "@/voice/audioUtils";
import { fetchAndDecryptMedia } from "@/security/mediaEncryption";
import type { Message } from "@/types";

interface VideoMessageProps {
  message: Message;
}

export function VideoMessage({ message }: VideoMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(message.videoDuration ?? 0);
  const [streamUrl, setStreamUrl] = useState<string | null>(
    message.streamUrl ?? message.fileUrl ?? null,
  );
  const [posterUrl, setPosterUrl] = useState<string | null>(
    message.previewUrl ?? null,
  );
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolveStream = useCallback(async (): Promise<string | null> => {
    // Local blob (sender before page reload) — already decrypted, use directly.
    if (streamUrl && !streamUrl.startsWith("http")) return streamUrl;

    let signedUrl = streamUrl;
    if (message.mediaId && !signedUrl) {
      const cached = getCachedSignedUrl(message.mediaId);
      if (cached) {
        signedUrl = cached;
      } else {
        try {
          const urls = await getMediaUrls(message.mediaId);
          cacheSignedUrl(message.mediaId, urls.stream_url, urls.expires_in);
          if (urls.preview_url && !message.mediaKey) {
            cachePreviewUrl(message.mediaId, urls.preview_url, urls.expires_in);
            setPosterUrl(urls.preview_url);
          }
          signedUrl = urls.stream_url;
        } catch {
          return message.fileUrl ?? null;
        }
      }
    }
    if (!signedUrl) return message.fileUrl ?? null;

    if (message.mediaKey) {
      try {
        const blobUrl = await fetchAndDecryptMedia(signedUrl, message.mediaKey, message.fileMimeType ?? "video/mp4");
        setStreamUrl(blobUrl);
        return blobUrl;
      } catch {
        /* fall through to encrypted URL */
      }
    }
    setStreamUrl(signedUrl);
    return signedUrl;
  }, [message.fileUrl, message.mediaId, message.mediaKey, message.fileMimeType, streamUrl]);

  useEffect(() => {
    if (message.previewUrl) setPosterUrl(message.previewUrl);
    else if (message.mediaId) {
      const cached = getCachedPreviewUrl(message.mediaId);
      if (cached) setPosterUrl(cached);
    }
  }, [message.mediaId, message.previewUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mounted) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setMounted(true);
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [mounted]);

  function stopPlayback() {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setPlaying(false);
    setProgress(0);
  }

  useEffect(() => () => stopPlayback(), []);

  async function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    setMounted(true);
    const url = await resolveStream();
    if (!url) return;
    const video = videoRef.current;
    if (!video) return;
    video.src = url;
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setDuration(video.duration);
    setProgress(video.currentTime / video.duration);
  }

  function onEnded() {
    stopPlayback();
  }

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (video?.duration && Number.isFinite(video.duration)) {
      setDuration(video.duration);
    }
  }

  const durLabel = formatVoiceDuration(Math.round(duration || message.videoDuration || 0));
  const progressPct = Math.min(100, Math.round(progress * 100));

  return (
    <div
      ref={containerRef}
      className={`video-msg ${message.videoNote ? "video-msg--note" : ""} ${message.outgoing ? "video-msg--out" : "video-msg--in"}`}
    >
      <button
        type="button"
        className="video-msg__stage"
        onClick={() => void togglePlay()}
        aria-label={playing ? "Pause video" : "Play video"}
      >
        {mounted ? (
          <video
            ref={videoRef}
            className="video-msg__video"
            playsInline
            preload="metadata"
            poster={posterUrl ?? undefined}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            onLoadedMetadata={onLoadedMetadata}
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt="" className="video-msg__poster" />
        ) : (
          <div className="video-msg__poster video-msg__poster--placeholder" aria-hidden>
            <span>🎬</span>
          </div>
        )}
        {!playing ? (
          <span className="video-msg__play-overlay" aria-hidden>
            <IconPlay size={28} />
          </span>
        ) : null}
        <span className="video-msg__dur">{durLabel}</span>
        {playing ? (
          <span
            className="video-msg__progress"
            style={{ width: `${progressPct}%` }}
            aria-hidden
          />
        ) : null}
      </button>
      {playing ? (
        <IconButton
          label="Pause"
          variant="ghost"
          className="video-msg__pause-btn"
          onClick={(e) => {
            e.stopPropagation();
            stopPlayback();
          }}
        >
          <IconPause size={18} />
        </IconButton>
      ) : null}
    </div>
  );
}
