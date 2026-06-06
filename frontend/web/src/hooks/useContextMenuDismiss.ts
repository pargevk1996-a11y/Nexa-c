import { useEffect, type RefObject } from "react";

/** Close menu on outside click; ignore the opening right-click and same-tick mousedown. */
export function useContextMenuDismiss(
  menuRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    function onPointerDown(e: MouseEvent) {
      if (e.button === 2) return;
      const el = menuRef.current;
      if (el?.contains(e.target as Node)) return;
      onClose();
    }

    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [menuRef, onClose, enabled]);
}
