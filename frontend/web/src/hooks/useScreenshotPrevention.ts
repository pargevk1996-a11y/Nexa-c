import { useEffect } from "react";

// ── Screenshot prevention — best-effort in a browser context ──────────────
//
// Hard limits:
//  • OS-level screenshot tools (Win+PrtSc, physical phone button, macOS
//    Cmd+Shift+3 captured by the OS before the browser sees it) cannot be
//    blocked from JavaScript. The OS captures the framebuffer directly.
//  • What we CAN block: in-browser keyboard shortcuts, print dialog,
//    right-click save, and screen-capture APIs (getDisplayMedia).
//  • What we CAN detect + react to: page visibility changes that happen when
//    most desktop screenshot tools momentarily hide the window.

let overlayEl: HTMLDivElement | null = null;

function showBlackOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "nexa-screenshot-guard";
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:#000",
    "pointer-events:none",
    "display:block",
  ].join(";");
  document.documentElement.appendChild(overlayEl);
}

function hideBlackOverlay() {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
}

export function useScreenshotPrevention() {
  useEffect(() => {
    // ── 1. Intercept known in-browser screenshot keyboard shortcuts ──────────
    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key ?? "").toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on Mac
      const shift = e.shiftKey;
      const alt = e.altKey;

      // Print Screen (Windows / Linux)
      if (key === "printscreen" || key === "print") {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlackOverlay();
        setTimeout(hideBlackOverlay, 500);
        return;
      }

      // Alt+PrintScreen (Windows — active window)
      if (alt && (key === "printscreen" || key === "print")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlackOverlay();
        setTimeout(hideBlackOverlay, 500);
        return;
      }

      // macOS: Cmd+Shift+3 / Cmd+Shift+4 / Cmd+Shift+5
      // (only caught when the browser window is focused and the shortcut
      //  is not yet intercepted by the OS — varies by macOS version)
      if (ctrl && shift && ["3", "4", "5"].includes(key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlackOverlay();
        setTimeout(hideBlackOverlay, 500);
        return;
      }

      // macOS: Cmd+Ctrl+Shift+3 / +4 (copy to clipboard variants)
      if (ctrl && shift && alt && ["3", "4"].includes(key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlackOverlay();
        setTimeout(hideBlackOverlay, 500);
        return;
      }

      // Windows Snipping Tool shortcut: Win+Shift+S can't be blocked
      // (Win key is not exposed to web browsers), but we block Ctrl+Shift+S
      if (ctrl && shift && key === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Block print dialog — common screenshot workaround
      if (ctrl && key === "p") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Block Ctrl+Shift+I / F12 — DevTools (can screenshot via DevTools)
      if ((ctrl && shift && key === "i") || key === "f12") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Block Ctrl+U — view source
      if (ctrl && key === "u") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Block Ctrl+S — save page (captures HTML)
      if (ctrl && key === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    };

    // ── 2. Black overlay on page hide ─────────────────────────────────────────
    // Many screenshot / screen-record tools (Snagit, OBS, browser extensions,
    // iOS "AssistiveTouch screenshot") briefly trigger visibilitychange.
    // We show a black overlay immediately when the page is hidden so that
    // whatever was captured during that instant is black.
    const onVisibilityChange = () => {
      if (document.hidden) {
        showBlackOverlay();
      } else {
        // Small delay so the overlay is still black for any pending capture
        setTimeout(hideBlackOverlay, 200);
      }
    };

    // ── 3. Block right-click context menu (prevents "Save as", Inspect, etc.) ─
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // ── 4. Block getDisplayMedia (screen-capture API) ─────────────────────────
    // Overwrites navigator.mediaDevices.getDisplayMedia so that any extension
    // or in-page script trying to start a screen share gets rejected.
    const originalGetDisplayMedia =
      navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices?.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = () =>
        Promise.reject(new DOMException("NotAllowedError", "NotAllowedError"));
    }

    // ── 5. CSS: mark the document root as protected ───────────────────────────
    document.documentElement.setAttribute("data-screenshot-guard", "1");

    // Register listeners — capture phase to intercept before other handlers
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("contextmenu", onContextMenu, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
      hideBlackOverlay();
      document.documentElement.removeAttribute("data-screenshot-guard");
      // Restore getDisplayMedia
      if (originalGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
    };
  }, []);
}
