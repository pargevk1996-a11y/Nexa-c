import { memo, useRef, useState } from "react";
import type { AvatarKind } from "@/types/profile";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  avatarUrl?: string | null;
  animatedUrl?: string | null;
  avatarKind?: AvatarKind;
}

const sizes = { sm: 47, md: 57, lg: 68, xl: 104 };

function isAnimatedKind(kind?: AvatarKind, url?: string | null): boolean {
  if (kind === "animated") return true;
  if (!url) return false;
  return /\.(gif|webp)(\?|$)/i.test(url);
}

// memo: all props are primitives, so conversation/contact lists re-render
// without recomputing the hue/initial or remounting <img> for unchanged rows.
export const Avatar = memo(function Avatar({
  name,
  size = "md",
  online,
  avatarUrl,
  animatedUrl,
  avatarKind,
}: AvatarProps) {
  const px = sizes[size];
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const hue = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const anim = animatedUrl ?? (isAnimatedKind(avatarKind, avatarUrl) ? avatarUrl : null);
  const still = anim ? null : avatarUrl;

  const [imgFailed, setImgFailed] = useState(false);
  // Reset error when the URL changes (e.g. user re-uploads avatar)
  const prevStillRef = useRef(still);
  if (prevStillRef.current !== still) {
    prevStillRef.current = still;
    if (imgFailed) setImgFailed(false);
  }

  const showFallback = !still || imgFailed;

  return (
    <span
      className={`avatar avatar--${size} ${anim ? "avatar--animated" : ""}`}
      style={showFallback && !anim ? { width: px, height: px, background: `hsl(${hue} 45% 35%)` } : undefined}
      aria-hidden={showFallback && !anim ? true : undefined}
    >
      {anim ? (
        <img src={anim} alt="" className="avatar__img" width={px} height={px} loading="lazy" />
      ) : !showFallback ? (
        <img
          src={still!}
          alt=""
          className="avatar__img"
          width={px}
          height={px}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        initial
      )}
      {online !== undefined ? (
        <span className={`avatar__dot ${online ? "avatar__dot--on" : ""}`} />
      ) : null}
    </span>
  );
});
