import { useEffect, useRef, useState } from "react";
import { getMediaUrls } from "@/api/media";
import { cacheSignedUrl, getCachedSignedUrl } from "@/media/mediaCache";

interface LazyMediaImageProps {
  mediaId?: string;
  previewUrl?: string | null;
  streamUrl?: string | null;
  alt: string;
  className?: string;
  onClick?: () => void;
}

export function LazyMediaImage({
  mediaId,
  previewUrl,
  streamUrl,
  alt,
  className,
  onClick,
}: LazyMediaImageProps) {
  const [src, setSrc] = useState<string | null>(previewUrl ?? streamUrl ?? null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;

    async function load() {
      if (previewUrl) {
        setSrc(previewUrl);
        return;
      }
      if (mediaId) {
        const cached = getCachedSignedUrl(`${mediaId}:preview`);
        if (cached) {
          setSrc(cached);
          return;
        }
        try {
          const urls = await getMediaUrls(mediaId);
          const url = urls.preview_url ?? urls.stream_url;
          if (url && !cancelled) {
            cacheSignedUrl(`${mediaId}:preview`, url, urls.expires_in);
            setSrc(url);
          }
        } catch {
          /* fallback placeholder */
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, mediaId, previewUrl, src]);

  if (!src) {
    return (
      <button type="button" ref={ref} className={className} onClick={onClick} aria-label={alt}>
        <span className="lazy-media__placeholder" aria-hidden />
      </button>
    );
  }

  return (
    <button type="button" ref={ref} className={className} onClick={onClick}>
      <img src={src} alt={alt} className="file-msg__thumb" loading="lazy" decoding="async" />
    </button>
  );
}
