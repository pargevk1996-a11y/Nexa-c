import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Mobile section navigation by horizontal swipe (the bottom nav bar is hidden on
 * phones). Swipe LEFT → next section, swipe RIGHT → previous, in this order:
 *   Chats → Contacts → Calls → Profile → Settings
 *
 * Only active on small screens. A swipe must be clearly horizontal and long
 * enough so it never fires on vertical scrolls or short taps.
 */
const ORDER = [
  "/app/chats",
  "/app/contacts",
  "/app/calls",
  "/app/profile",
  "/app/settings",
] as const;

const SWIPE_MIN_X = 70; // px horizontal distance to count as a swipe
const HORIZONTAL_RATIO = 1.6; // |dx| must dominate |dy| by this factor

export function useSectionSwipe(): void {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (window.innerWidth > 768 || e.touches.length !== 1) {
        tracking = false;
        return;
      }
      // Don't hijack swipes that begin on a control that may scroll/drag
      // horizontally itself (text fields, the folder pill row, sliders).
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [data-no-section-swipe], .chat-folders, .image-gallery, .chat-main")) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;

      const idx = ORDER.findIndex((p) => location.pathname.startsWith(p));
      if (idx === -1) return;
      const nextIdx = dx < 0 ? idx + 1 : idx - 1; // swipe left → next section
      if (nextIdx < 0 || nextIdx >= ORDER.length) return;
      navigate(ORDER[nextIdx]);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [navigate, location.pathname]);
}
