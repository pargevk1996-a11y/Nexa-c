import { useEffect } from "react";

// Secondary screenshot-prevention layer (primary: privacySeal.ts).
// Users consented at registration to having all capture capabilities disabled.

// Pre-created overlay — appended once on mount, shown via opacity (compositor-only,
// ~0ms latency). Dynamic createElement on keydown is too slow (~50ms).
let overlayEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureOverlay(): HTMLDivElement {
  if (overlayEl && overlayEl.isConnected) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "nexa-screenshot-guard";
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#000;pointer-events:none;" +
    "opacity:0;will-change:opacity;transform:translateZ(0)";
  document.documentElement.appendChild(overlayEl);
  return overlayEl;
}

function showOverlay() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  // Also blacken the root element directly — propagates through CSS cascade
  // without waiting for compositor flush, covers the ~1 frame GPU lag window.
  document.documentElement.style.setProperty("background", "#000", "important");
  ensureOverlay().style.opacity = "1";
}

function hideOverlay(delayMs = 0) {
  if (hideTimer) clearTimeout(hideTimer);
  const doHide = () => {
    if (overlayEl) overlayEl.style.opacity = "0";
    document.documentElement.style.removeProperty("background");
    hideTimer = null;
  };
  if (delayMs) {
    hideTimer = setTimeout(doHide, delayMs);
  } else {
    doHide();
  }
}

export function useScreenshotPrevention() {
  useEffect(() => {
    // Pre-create overlay on mount so first showOverlay() is a pure opacity change.
    ensureOverlay();

    // ── 1. Keyboard shortcuts ─────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key ?? "";
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // PrintScreen / Snapshot / F13 — any modifier combo (plain, Shift, Alt, Ctrl)
      if (
        e.code === "PrintScreen" ||
        key === "PrintScreen" ||
        key === "Snapshot" ||
        key === "Print" ||
        e.keyCode === 44 ||
        e.code === "F13"
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showOverlay();
        hideOverlay(700);
        return;
      }

      // Shift held alone → pre-emptive blackout for Shift+PrintScreen.
      // On Linux/GNOME, OS eats Shift+PrtSc before keydown fires, but the overlay
      // is already painted the moment Shift is pressed. Hides on Shift keyup.
      if ((key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") && !ctrl && !alt) {
        showOverlay();
        return;
      }

      // macOS: Cmd+Shift+3/4/5/6
      if (ctrl && shift && ["3", "4", "5", "6"].includes(lower)) {
        e.preventDefault(); e.stopImmediatePropagation();
        showOverlay(); hideOverlay(700); return;
      }

      // Win+Shift+S / Meta+Shift+S (Snipping Tool, KDE Spectacle) / Cmd+Shift+S
      if (ctrl && shift && lower === "s") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Windows Game Bar: Win+G, Win+Alt+R, Win+Alt+G
      if (e.metaKey && lower === "g") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.metaKey && alt && (lower === "r" || lower === "g")) { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // GNOME recorder: Ctrl+Alt+Shift+R  /  KDE: Meta+Shift+R
      if (ctrl && alt && shift && lower === "r") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.metaKey && shift && lower === "r") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Print / print-to-PDF
      if (ctrl && lower === "p") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Save page
      if (ctrl && !shift && lower === "s") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // DevTools: F12, Ctrl+Shift+I/J/C/K/E
      if (key === "F12" || (ctrl && shift && ["i", "j", "c", "k", "e"].includes(lower))) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }

      // View source
      if (ctrl && lower === "u") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Select-all outside compose fields
      if (ctrl && lower === "a" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Shift released → hide pre-emptive overlay (200ms ensures OS capture is done)
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        hideOverlay(200);
        return;
      }
      // PrintScreen keyup: Windows Chrome only sees keyup (OS eats keydown).
      // Screenshot already taken, but we black out immediately so any pending
      // clipboard/file write captures the black frame.
      if (
        e.code === "PrintScreen" ||
        e.key === "PrintScreen" ||
        e.key === "Snapshot" ||
        e.keyCode === 44
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showOverlay();
        hideOverlay(700);
      }
    };

    // ── 2. Window blur → overlay ──────────────────────────────────────────────
    // Catches OS screenshot tools that steal focus before capturing:
    // Win+Shift+S (Snipping Tool), Win+G (Game Bar), macOS Screenshot UI,
    // GNOME region selector, OBS, Greenshot, Snagit.
    const onBlur = () => showOverlay();
    const onFocus = () => hideOverlay(300);

    // ── 3. Page visibility ────────────────────────────────────────────────────
    const onVisibilityChange = () => {
      if (document.hidden) showOverlay();
      else hideOverlay(200);
    };

    // ── 4. 3-finger touch → overlay ──────────────────────────────────────────
    // iOS AssistiveTouch screenshot gesture and Android multi-touch screenshot
    // tools use 3 simultaneous fingers. Show overlay on any 3+ finger contact.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) showOverlay();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 3) hideOverlay(400);
    };

    // ── 5. Right-click ────────────────────────────────────────────────────────
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

    // ── 6. Copy outside compose fields ────────────────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // ── 7. Block getDisplayMedia (screen-share API) ───────────────────────────
    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices?.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = () =>
        Promise.reject(new DOMException("NotAllowedError", "NotAllowedError"));
    }

    document.documentElement.setAttribute("data-screenshot-guard", "1");

    window.addEventListener("keydown", onKeyDown, { capture: true, passive: false });
    window.addEventListener("keyup", onKeyUp, { capture: true, passive: false });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    document.addEventListener("copy", onCopy, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
      document.removeEventListener("copy", onCopy, { capture: true });
      if (hideTimer) clearTimeout(hideTimer);
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      document.documentElement.removeAttribute("data-screenshot-guard");
      if (origGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, []);
}
