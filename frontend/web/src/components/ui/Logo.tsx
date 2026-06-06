import { BRAND_LOGO_URL, BRAND_NAME } from "@/config/brand";

/** Base sizes ×2 for sharper brand presence on auth and splash screens. */
const SIZES = { sm: 216, md: 264, hero: 560 } as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  showText?: boolean;
  /** Gentle float, glow, and ring — respects prefers-reduced-motion. */
  animated?: boolean;
}

export function Logo({ size = "md", showText = true, animated = false }: LogoProps) {
  const px = SIZES[size];
  const rootClass = ["logo", `logo--${size}`, animated ? "logo--animated" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} aria-label={BRAND_NAME}>
      {animated ? (
        <>
          <span className="logo__aura" aria-hidden />
          <span className="logo__ring" aria-hidden />
          <span className="logo__typing" aria-hidden>
            <span className="logo__dot" />
            <span className="logo__dot" />
            <span className="logo__dot" />
          </span>
        </>
      ) : null}
      <img
        src={BRAND_LOGO_URL}
        alt=""
        className="logo__img"
        width={px}
        height={px}
        decoding="async"
      />
      {showText ? <span>{BRAND_NAME}</span> : null}
    </div>
  );
}
