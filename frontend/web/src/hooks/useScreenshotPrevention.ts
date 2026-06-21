import { useEffect } from "react";

// Secondary screenshot-prevention layer (primary: privacySeal.ts).
// Users consented at registration to having all capture capabilities disabled.

let overlayEl: HTMLDivElement | null = null;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;

function showBlackOverlay() {
  if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "nexa-screenshot-guard";
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#000;pointer-events:none;display:block";
  document.documentElement.appendChild(overlayEl);
}

function hideBlackOverlay(delayMs = 0) {
  if (delayMs) {
    if (overlayTimer) clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => {
      overlayEl?.remove();
      overlayEl = null;
      overlayTimer = null;
    }, delayMs);
  } else {
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
    overlayEl?.remove();
    overlayEl = null;
  }
}

export function useScreenshotPrevention() {
  useEffect(() => {
    // ── 1. Keyboard shortcuts ─────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key ?? "";
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // PrintScreen / Snapshot / F13 (dedicated capture key on some keyboards)
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
        showBlackOverlay();
        hideBlackOverlay(600);
        return;
      }

      // macOS: Cmd+Shift+3/4/5/6  and  Cmd+Ctrl+Shift+3/4 (copy-to-clipboard variants)
      if (ctrl && shift && ["3", "4", "5", "6"].includes(lower)) {
        e.preventDefault(); e.stopImmediatePropagation();
        showBlackOverlay(); hideBlackOverlay(600); return;
      }

      // Win+Shift+S / Meta+Shift+S (Snipping Tool, KDE Spectacle) / macOS Cmd+Shift+S
      if (ctrl && shift && lower === "s") {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }

      // Windows Game Bar: Win+G, Win+Alt+R, Win+Alt+G
      if (e.metaKey && lower === "g") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.metaKey && alt && (lower === "r" || lower === "g")) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }

      // GNOME built-in recorder: Ctrl+Alt+Shift+R
      if (ctrl && alt && shift && lower === "r") { e.preventDefault(); e.stopImmediatePropagation(); return; }
      // KDE / Meta+Shift+R
      if (e.metaKey && shift && lower === "r") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Print / print-to-PDF
      if (ctrl && lower === "p") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Save page
      if (ctrl && !shift && lower === "s") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // DevTools: F12, Ctrl+Shift+I/J/C/K/E
      if (
        key === "F12" ||
        (ctrl && shift && ["i", "j", "c", "k", "e"].includes(lower))
      ) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }

      // View source
      if (ctrl && lower === "u") { e.preventDefault(); e.stopImmediatePropagation(); return; }

      // Select-all outside compose fields (prevents mass-copy)
      if (
        ctrl && lower === "a" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    };

    // ── 2. Window blur → overlay ──────────────────────────────────────────────
    // Catches OS screenshot tools that steal focus before capturing:
    // Win+Shift+S (Snipping Tool), Win+G (Game Bar), macOS Screenshot UI,
    // OBS, Greenshot, Snagit, external screen recorders.
    const onBlur = () => showBlackOverlay();
    const onFocus = () => hideBlackOverlay(300);

    // ── 3. Page visibility ────────────────────────────────────────────────────
    const onVisibilityChange = () => {
      if (document.hidden) showBlackOverlay();
      else hideBlackOverlay(200);
    };

    // ── 4. Right-click ────────────────────────────────────────────────────────
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

    // ── 5. Copy outside compose fields ────────────────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // ── 6. Block getDisplayMedia (screen-share API) ───────────────────────────
    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (navigator.mediaDevices?.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = () =>
        Promise.reject(new DOMException("NotAllowedError", "NotAllowedError"));
    }

    document.documentElement.setAttribute("data-screenshot-guard", "1");

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    document.addEventListener("copy", onCopy, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("contextmenu", onContextMenu, { capture: true });
      document.removeEventListener("copy", onCopy, { capture: true });
      hideBlackOverlay();
      document.documentElement.removeAttribute("data-screenshot-guard");
      if (origGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, []);
}
