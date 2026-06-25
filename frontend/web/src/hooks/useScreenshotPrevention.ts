import { useEffect } from "react";

// Secondary screenshot-prevention layer (primary: privacySeal.ts).
// Users consented at registration to having all capture capabilities disabled.

let overlayEl: HTMLDivElement | null = null;
let clipSvgEl: SVGSVGElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const SVG_NS = "http://www.w3.org/2000/svg";
const CLIP_ID = "nexa-guard-clip";
const PATH_ID = "nexa-guard-path";

function ensureOverlay(): HTMLDivElement {
  if (overlayEl && overlayEl.isConnected) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "nexa-screenshot-guard";
  overlayEl.setAttribute("aria-hidden", "true");
  // opacity-based show/hide: compositor-thread only, ~0ms latency.
  overlayEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#000;pointer-events:none;" +
    "opacity:0;will-change:opacity;transform:translateZ(0)";
  document.documentElement.appendChild(overlayEl);
  return overlayEl;
}

function ensureClipSvg(): SVGPathElement {
  if (!clipSvgEl || !clipSvgEl.isConnected) {
    clipSvgEl = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    clipSvgEl.setAttribute("style",
      "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;z-index:0");
    clipSvgEl.innerHTML =
      `<defs><clipPath id="${CLIP_ID}" clipPathUnits="userSpaceOnUse">` +
      `<path id="${PATH_ID}" clip-rule="evenodd"/></clipPath></defs>`;
    document.body.appendChild(clipSvgEl);
  }
  return document.getElementById(PATH_ID) as unknown as SVGPathElement;
}

function getActiveInputEl(): HTMLElement | null {
  const a = document.activeElement;
  if (!a || !(a instanceof HTMLElement)) return null;
  if (
    a instanceof HTMLInputElement ||
    a instanceof HTMLTextAreaElement ||
    a.isContentEditable
  ) return a;
  return null;
}

// Full black overlay — used for PrintScreen, blur, visibility events.
function showOverlay() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const el = ensureOverlay();
  el.style.clipPath = "";
  // Also blacken root directly — covers the ~1 GPU-frame lag window.
  document.documentElement.style.setProperty("background", "#000", "important");
  el.style.opacity = "1";
}

// Black overlay with a transparent window over the currently focused input.
// Used when Shift is held so the user can still see what they're typing.
function showOverlayWithInputHole() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const el = ensureOverlay();
  const active = getActiveInputEl();

  if (active) {
    const r = active.getBoundingClientRect();
    const pad = 6;
    const x1 = Math.max(0, r.left - pad);
    const y1 = Math.max(0, r.top - pad);
    const x2 = Math.min(window.innerWidth, r.right + pad);
    const y2 = Math.min(window.innerHeight, r.bottom + pad);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // SVG even-odd fill: outer rect + inner rect (both clockwise) → hole at inner rect.
    const pathEl = ensureClipSvg();
    pathEl.setAttribute("d",
      `M0,0 H${w} V${h} H0 Z M${x1},${y1} H${x2} V${y2} H${x1} Z`);
    el.style.clipPath = `url(#${CLIP_ID})`;
  } else {
    el.style.clipPath = "";
  }

  document.documentElement.style.setProperty("background", "#000", "important");
  el.style.opacity = "1";
}

function hideOverlay(delayMs = 0) {
  if (hideTimer) clearTimeout(hideTimer);
  const doHide = () => {
    if (overlayEl) {
      overlayEl.style.opacity = "0";
      overlayEl.style.clipPath = "";
    }
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
    ensureOverlay();

    // ── 1. Keyboard shortcuts ─────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key ?? "";
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // PrintScreen / Snapshot / F13 — any modifier combo incl. Shift+PrtSc
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

      // Shift held → black screen with hole over active input.
      // When Shift+PrtSc is pressed, the overlay (with or without hole) is already
      // on screen before the OS captures, so the screenshot sees only black.
      if ((key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") && !ctrl && !alt) {
        showOverlayWithInputHole();
        return;
      }

      // macOS: Cmd+Shift+3/4/5/6
      if (ctrl && shift && ["3", "4", "5", "6"].includes(lower)) {
        e.preventDefault(); e.stopImmediatePropagation();
        showOverlay(); hideOverlay(700); return;
      }

      // Win+Shift+S / Meta+Shift+S / Cmd+Shift+S (Snipping Tool, KDE Spectacle)
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
      // Shift released → hide overlay (200ms delay: OS screenshot must be done)
      if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
        hideOverlay(200);
        return;
      }
      // PrintScreen keyup: Windows Chrome sees only keyup (OS eats keydown).
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
    const onBlur = () => showOverlay();
    const onFocus = () => hideOverlay(300);

    // ── 3. Page visibility ────────────────────────────────────────────────────
    const onVisibilityChange = () => {
      if (document.hidden) showOverlay();
      else hideOverlay(200);
    };

    // ── 4. 3-finger touch → overlay ──────────────────────────────────────────
    // iOS AssistiveTouch screenshot and Android multi-touch capture tools
    // register 3+ simultaneous touch points.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) showOverlay();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 3) hideOverlay(400);
    };

    // ── 6. Copy outside compose fields ────────────────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // ── 7. Block getDisplayMedia ──────────────────────────────────────────────
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
    document.addEventListener("copy", onCopy, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("copy", onCopy, { capture: true });
      if (hideTimer) clearTimeout(hideTimer);
      if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      if (clipSvgEl) { clipSvgEl.remove(); clipSvgEl = null; }
      document.documentElement.removeAttribute("data-screenshot-guard");
      if (origGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, []);
}
