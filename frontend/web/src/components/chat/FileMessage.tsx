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
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const name = message.fileName ?? message.text ?? "File";
  const size = message.fileSize ?? 0;
  const mimeType = message.fileMimeType ?? "";
  const category = message.fileCategory ?? getFileCategory(mimeType);
  const hasRemote = Boolean(message.mediaId || message.streamUrl || message.previewUrl);

  function openImageGallery() {
    onImageClick?.(message.id);
    onOpen?.();
  }

  async function fetchUrls(): Promise<{ stream: string; dl: string } | null> {
    if (!message.mediaId) return null;
    setIsLoadingUrl(true);
    try {
      const urls = await getMediaUrls(message.mediaId);
      cacheSignedUrl(message.mediaId, urls.stream_url, urls.expires_in);
      setViewerUrl(urls.stream_url);
      setDownloadUrl(urls.download_url);
      return { stream: urls.stream_url, dl: urls.download_url };
    } catch {
      return null;
    } finally {
      setIsLoadingUrl(false);
    }
  }

  async function openViewer() {
    if (category === "image" && onImageClick) {
      openImageGallery();
      return;
    }
    const streamUrl = viewerUrl ?? (await fetchUrls())?.stream ?? null;
    if (!streamUrl && !message.fileUrl) return;
    setViewerUrl(streamUrl ?? message.fileUrl ?? null);
    setViewerOpen(true);
  }

  async function download(e: React.MouseEvent) {
    e.stopPropagation();
    // Always prefer the dedicated download URL (Content-Disposition: attachment)
    let url = downloadUrl ?? (await fetchUrls())?.dl ?? null;
    // Fallback to stream/file URL if no download_url available
    if (!url) url = viewerUrl ?? message.streamUrl ?? message.fileUrl ?? null;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const canPreview =
    category === "image" ||
    category === "video" ||
    category === "audio" ||
    mimeType === "application/pdf" ||
    mimeType === "image/svg+xml";

  async function downloadDirect() {
    let url = downloadUrl ?? (await fetchUrls())?.dl ?? null;
    if (!url) url = viewerUrl ?? message.streamUrl ?? message.fileUrl ?? null;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (category === "image") {
    return (
      <>
        <div className="file-msg file-msg--card file-msg--image-only">
          <LazyMediaImage
            mediaId={message.mediaId}
            previewUrl={message.previewUrl}
            streamUrl={message.streamUrl ?? message.fileUrl}
            alt={name}
            className="file-msg__preview-btn"
            onClick={() => (onImageClick ? openImageGallery() : void openViewer())}
          />
          <div className="file-msg__meta">
            <span className="file-msg__name">{name}</span>
            {size > 0 ? <span className="file-msg__size">{formatFileSize(size)}</span> : null}
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

  return (
    <>
      <button
        type="button"
        className="file-msg file-msg--pill"
        disabled={isLoadingUrl}
        onClick={() => {
          if (canPreview && (hasRemote || message.fileUrl)) {
            void openViewer();
          } else if (!isSuperSecret) {
            void downloadDirect();
          }
        }}
        aria-label={canPreview ? `Open ${name}` : `Download ${name}`}
      >
        <div className="file-msg__icon-wrap" aria-hidden>
          {category === "video" ? "🎬" : category === "audio" ? "🎵" : "📎"}
        </div>
        <div className="file-msg__meta">
          <span className="file-msg__name">{isLoadingUrl ? "Loading…" : name}</span>
          {size > 0 ? <span className="file-msg__size">{formatFileSize(size)}</span> : null}
        </div>
      </button>
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
