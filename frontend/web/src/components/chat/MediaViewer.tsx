import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatFileSize, getFileCategory } from "@/utils/files";
import { useBackgroundPlayback } from "@/media/useBackgroundPlayback";

interface MediaViewerProps {
  url: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  allowDownload?: boolean;
  onClose: () => void;
  onOpened?: () => void;
}

export function MediaViewer({
  url,
  fileName,
  mimeType,
  fileSize,
  allowDownload = true,
  onClose,
  onOpened,
}: MediaViewerProps) {
  const category = getFileCategory(mimeType);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  useBackgroundPlayback(audioRef.current, audioPlaying);

  useEffect(() => {
    onOpened?.();
  }, [onOpened]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function download() {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return createPortal(
    <div className="media-viewer" role="dialog" aria-label={`View ${fileName}`}>
      <div className="media-viewer__backdrop" onClick={onClose} />
      <div className="media-viewer__panel" onClick={(e) => e.stopPropagation()}>
        <header className="media-viewer__head">
          <div className="media-viewer__title">
            <strong>{fileName}</strong>
            {fileSize ? <span>{formatFileSize(fileSize)}</span> : null}
          </div>
          <div className="media-viewer__actions">
            {allowDownload ? (
              <button type="button" className="btn btn--ghost" onClick={download}>
                Download
              </button>
            ) : null}
            <button type="button" className="media-viewer__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>
        <div className="media-viewer__body">
          {category === "image" || mimeType === "image/svg+xml" ? (
            <img className="media-viewer__img" src={url} alt={fileName} />
          ) : category === "video" ? (
            <video className="media-viewer__video" src={url} controls autoPlay playsInline />
          ) : category === "audio" ? (
            <audio
              ref={audioRef}
              className="media-viewer__audio"
              src={url}
              controls
              autoPlay
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => setAudioPlaying(false)}
            />
          ) : mimeType === "application/pdf" ? (
            <iframe className="media-viewer__frame" src={url} title={fileName} />
          ) : (
            <div className="media-viewer__fallback">
              <p>Preview is not available for this file type.</p>
              <p className="media-viewer__mime">{mimeType || "Unknown type"}</p>
              {allowDownload ? (
                <button type="button" className="btn btn--primary" onClick={download}>
                  Download to open
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
