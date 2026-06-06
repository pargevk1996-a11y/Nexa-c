import { useEffect, useCallback } from "react";
import type { Message } from "@/types";

export interface GalleryImage {
  messageId: string;
  url: string;
  alt: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function collectGalleryImages(messages: Message[]): GalleryImage[] {
  const out: GalleryImage[] = [];
  for (const m of messages) {
    if (m.recalled || m.deleted) continue;
    const url =
      m.fileCategory === "image"
        ? m.previewUrl ?? m.streamUrl ?? m.fileUrl
        : null;
    if (!url) continue;
    out.push({
      messageId: m.id,
      url,
      alt: m.fileName ?? "Photo",
    });
  }
  return out;
}

export function ImageGallery({ images, index, onClose, onIndexChange }: ImageGalleryProps) {
  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  return (
    <div className="image-gallery" role="dialog" aria-label="Image gallery">
      <div className="image-gallery__backdrop" onClick={onClose} />
      <header className="image-gallery__head">
        <span className="image-gallery__counter">
          {index + 1} / {images.length}
        </span>
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
      <img
        key={current.messageId}
        className="image-gallery__img"
        src={current.url}
        alt={current.alt}
      />
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
              <img src={img.url} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
