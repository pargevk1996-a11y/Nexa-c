import { useEffect } from "react";

/** Keeps composer above mobile virtual keyboard via --keyboard-inset on :root. */
export function useKeyboardInset(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const root = document.documentElement;
    const vv = window.visualViewport;

    const apply = () => {
      if (!vv) {
        root.style.setProperty("--keyboard-inset", "0px");
        return;
      }
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };

    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.setProperty("--keyboard-inset", "0px");
    };
  }, [enabled]);
}
