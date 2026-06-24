import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMediaUrls } from "@/api/media";
import { cacheSignedUrl, getCachedSignedUrl } from "@/media/mediaCache";
import { fetchAndDecryptMedia } from "@/security/mediaEncryption";
import type { Message } from "@/types";

export interface GalleryImage {
  messageId: string;
  /** Full-resolution stream URL when already known (signed/cached). */
  url: string | null;
  /** Low-res thumbnail shown instantly while the full image loads. */
  previewUrl: string | null;
  /** Media id used to fetch a fresh signed full-res URL on demand. */
  mediaId: string | null;
  alt: string;
  /** base64 AES-256-GCM key — set when image is E2EE-encrypted. */
  mediaKey?: string | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

export function collectGalleryImages(messages: Message[]): GalleryImage[] {
  const out: GalleryImage[] = [];
  for (const m of messages) {
    if (m.recalled || m.deleted) continue;
    if (m.fileCategory !== "image") continue;
    // Full-res first (stream/file); thumbnail only as a placeholder.
    const full = m.streamUrl ?? m.fileUrl ?? null;
    const preview = m.previewUrl ?? null;
    if (!full && !preview && !m.mediaId) continue;
    out.push({
      messageId: m.id,
      url: full,
      previewUrl: preview,
      mediaId: m.mediaId ?? null,
      alt: m.fileName ?? "Photo",
      mediaKey: m.mediaKey ?? null,
    });
  }
  return out;
}

export function ImageGallery({ images, index, onClose, onIndexChange }: ImageGalleryProps) {
  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  // Resolved full-resolution URL for the current image (fetched on demand).
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // mediaIds whose stale signed URL already triggered one auto re-fetch.
  const retriedRef = useRef<Set<string>>(new Set());

  // Zoom / pan transform state. Reset whenever the visible image changes.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Resolve the highest-quality source for the current image: prefer a known
  // full-res URL, then a cached signed URL, otherwise fetch a fresh one. The
  // thumbnail is shown underneath as an instant placeholder while this loads.
  useEffect(() => {
    if (!current) return;
    resetTransform();
    let cancelled = false;
    setStatus("loading");

    async function resolve() {
      let signedUrl = current.url ?? (current.mediaId ? getCachedSignedUrl(current.mediaId) : null);
      if (!signedUrl && current.mediaId) {
        try {
          const urls = await getMediaUrls(current.mediaId);
          if (cancelled) return;
          cacheSignedUrl(current.mediaId, urls.stream_url, urls.expires_in);
          signedUrl = urls.stream_url;
        } catch {
          if (!cancelled) {
            setFullUrl(current.previewUrl ?? null);
            setStatus(current.previewUrl ? "ready" : "error");
          }
          return;
        }
      }
      if (!signedUrl) {
        setFullUrl(current.previewUrl ?? null);
        setStatus(current.previewUrl ? "ready" : "error");
        return;
      }
      if (current.mediaKey) {
        try {
          const blobUrl = await fetchAndDecryptMedia(signedUrl, current.mediaKey, "image/jpeg");
          if (!cancelled) setFullUrl(blobUrl);
        } catch {
          if (!cancelled) setFullUrl(signedUrl);
        }
      } else {
        if (!cancelled) setFullUrl(signedUrl);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [current, resetTransform]);

  const retry = useCallback(() => {
    if (!current?.mediaId) return;
    setStatus("loading");
    void getMediaUrls(current.mediaId)
      .then(async (urls) => {
        cacheSignedUrl(current.mediaId as string, urls.stream_url, urls.expires_in);
        if (current.mediaKey) {
          try {
            const blobUrl = await fetchAndDecryptMedia(urls.stream_url, current.mediaKey, "image/jpeg");
            setFullUrl(blobUrl);
            return;
          } catch { /* fall through */ }
        }
        setFullUrl(urls.stream_url);
      })
      .catch(() => setStatus("error"));
  }, [current]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP)), []);
  const zoomOut = useCallback(
    () =>
      setZoom((z) => {
        const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      }),
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
      if (e.key === "0") resetTransform();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext, zoomIn, zoomOut, resetTransform]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.002 * z));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // Native pinch-to-zoom on touch devices (two-finger distance → zoom factor).
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (!pinchRef.current) {
      pinchRef.current = { dist, zoom };
      return;
    }
    const ratio = dist / pinchRef.current.dist;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * ratio)));
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
  }

  if (!current) return null;

  const placeholder = current.previewUrl;
  const showImg = fullUrl ?? placeholder;

  return createPortal(
    <div className="image-gallery" role="dialog" aria-label="Image gallery">
      <div className="image-gallery__backdrop" onClick={onClose} />
      <header className="image-gallery__head">
        <span className="image-gallery__counter">
          {index + 1} / {images.length}
        </span>
        <div className="image-gallery__zoom-controls">
          <button type="button" onClick={zoomOut} aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}>
            −
          </button>
          <span className="image-gallery__zoom-level">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={zoomIn} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}>
            +
          </button>
        </div>
        <button type="button" className="image-gallery__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {hasPrev ? (
        <button
          type="button"
          className="image-gallery__nav image-gallery__nav--prev"
          onClick={goPrev}
          aria-label="Previous image"
        >
          ‹
        </button>
      ) : null}
      <div
        className="image-gallery__stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => (zoom > 1 ? resetTransform() : setZoom(2))}
        style={{ cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
      >
        {status === "loading" && !showImg ? (
          <div className="image-gallery__spinner" aria-label="Loading image" />
        ) : null}
        {status === "error" ? (
          <div className="image-gallery__error">
            <p>Could not load image.</p>
            {current.mediaId ? (
              <button type="button" className="btn btn--primary" onClick={retry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : showImg ? (
          <img
            key={current.messageId}
            className="image-gallery__img"
            src={showImg}
            alt={current.alt}
            draggable={false}
            onLoad={() => setStatus("ready")}
            onError={() => {
              // Old image: its stored signed URL likely expired — re-fetch a
              // fresh one via mediaId once before giving up.
              const id = current?.mediaId;
              if (id && showImg !== placeholder && !retriedRef.current.has(id)) {
                retriedRef.current.add(id);
                retry();
              } else {
                setStatus(showImg === placeholder ? "ready" : "error");
              }
            }}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
              transition: dragRef.current ? "none" : "transform 0.12s ease-out",
            }}
          />
        ) : null}
      </div>
      {hasNext ? (
        <button
          type="button"
          className="image-gallery__nav image-gallery__nav--next"
          onClick={goNext}
          aria-label="Next image"
        >
          ›
        </button>
      ) : null}
      {images.length > 1 ? (
        <div className="image-gallery__thumbs" role="tablist">
          {images.map((img, i) => (
            <button
              key={img.messageId}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`image-gallery__thumb ${i === index ? "image-gallery__thumb--active" : ""}`}
              onClick={() => onIndexChange(i)}
            >
              <img src={img.previewUrl ?? img.url ?? ""} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
