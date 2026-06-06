import { useState } from "react";
import { MediaViewer } from "@/components/chat/MediaViewer";
import { LazyMediaImage } from "@/components/media/LazyMediaImage";
import { getMediaUrls } from "@/api/media";
import { cacheSignedUrl } from "@/media/mediaCache";
import type { Message } from "@/types";
import { formatFileSize, getFileCategory } from "@/utils/files";

interface FileMessageProps {
  message: Message;
  onOpen?: () => void;
  onImageClick?: (messageId: string) => void;
  isSuperSecret?: boolean;
}

export function FileMessage({ message, onOpen, onImageClick, isSuperSecret = false }: FileMessageProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(message.streamUrl ?? message.fileUrl ?? null);
  const name = message.fileName ?? "File";
  const size = message.fileSize ?? 0;
  const mimeType = message.fileMimeType ?? "";
  const category = message.fileCategory ?? getFileCategory(mimeType);
  const hasRemote = Boolean(message.mediaId || message.streamUrl || message.previewUrl);

  function openImageGallery() {
    onImageClick?.(message.id);
    onOpen?.();
  }

  async function openViewer() {
    if (category === "image" && onImageClick) {
      openImageGallery();
      return;
    }
    if (message.mediaId && !viewerUrl) {
      try {
        const urls = await getMediaUrls(message.mediaId);
        cacheSignedUrl(message.mediaId, urls.stream_url, urls.expires_in);
        setViewerUrl(urls.stream_url);
        setViewerOpen(true);
        return;
      } catch {
        return;
      }
    }
    if (!viewerUrl && !message.fileUrl) return;
    setViewerUrl(viewerUrl ?? message.fileUrl ?? null);
    setViewerOpen(true);
  }

  function download(e: React.MouseEvent) {
    e.stopPropagation();
    const url = viewerUrl ?? message.streamUrl ?? message.fileUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!hasRemote && !message.fileUrl) {
    return <div className="file-msg file-msg--doc">{name}</div>;
  }

  const canPreview =
    category === "image" ||
    category === "video" ||
    category === "audio" ||
    mimeType === "application/pdf" ||
    mimeType === "image/svg+xml";

  return (
    <>
      <div className={`file-msg file-msg--card ${category === "image" ? "file-msg--image-only" : ""}`}>
        {category === "image" ? (
          <LazyMediaImage
            mediaId={message.mediaId}
            previewUrl={message.previewUrl}
            streamUrl={message.streamUrl ?? message.fileUrl}
            alt={name}
            className="file-msg__preview-btn"
            onClick={() => (onImageClick ? openImageGallery() : void openViewer())}
          />
        ) : (
          <div className="file-msg__icon-wrap" aria-hidden>
            {category === "video" ? "🎬" : category === "audio" ? "🎵" : "📎"}
          </div>
        )}
        <div className="file-msg__meta">
          <span className="file-msg__name">{name}</span>
          <span className="file-msg__size">{formatFileSize(size)}</span>
          <div className="file-msg__actions">
            {canPreview ? (
              <button type="button" className="file-msg__action" onClick={() => void openViewer()}>
                Open
              </button>
            ) : null}
            {!isSuperSecret ? (
              <button type="button" className="file-msg__action" onClick={download}>
                Download
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {viewerOpen && viewerUrl ? (
        <MediaViewer
          url={viewerUrl}
          fileName={name}
          mimeType={mimeType}
          fileSize={size}
          allowDownload={!isSuperSecret}
          onClose={() => setViewerOpen(false)}
          onOpened={onOpen}
        />
      ) : null}
    </>
  );
}
