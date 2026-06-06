import { applyGuestAuthDocumentFlag, isGuestAuthPath } from "./authRoutes";
import { isScreenshotAllowed } from "./screenshotPolicy";
import { dispatchScreenshot, dispatchAway } from "./screenshotEvent";
import { storageKeys } from "./storageKeys";

const TAB_UNLOCKED_KEY = storageKeys.tabUnlocked;

const SHIELD_CLASS = "privacy-shield-active";
const PROTECTED_CLASS = "privacy-protected";
const NATIVE_SHIELD_ID = "privacy-shield-native";

const SHIELD_LATCH_MS = 15_000;
const POLL_MS = 80;

// Persists lock across page refresh — cleared only on explicit unlock.
const SEAL_SESSION_KEY = "_nxs";

let shieldUntil = 0;
let installed = false;

/** Timestamp (ms) when shield was last activated. 0 = not active. */
let lockedAt = 0;
/** Shield stays until user explicitly clicks — set on every activation. */
let requiresExplicitUnlock = false;

/**
 * Pre-created instant blackout overlay — appended to <body> once so it's always
 * in the DOM. Showing it is a single style mutation, no React or CSS-class delays.
 * opacity:0→1 is a compositor-thread operation (no layout), so it's faster than
 * display:none→block which forces a full reflow.
 */
let instantOverlay: HTMLDivElement | null = null;
let cachedRoot: HTMLElement | null = null;
let cachedNativeShield: HTMLElement | null = null;

function getInstantOverlay(): HTMLDivElement {
  if (instantOverlay) return instantOverlay;
  instantOverlay = document.createElement("div");
  instantOverlay.style.cssText =
    "opacity:0;position:fixed;inset:0;z-index:2147483647;background:#0c0a14;pointer-events:none;will-change:opacity;transform:translateZ(0);";
  document.body.appendChild(instantOverlay);
  return instantOverlay;
}

function getCachedRoot(): HTMLElement | null {
  return cachedRoot ?? (cachedRoot = document.getElementById("root"));
}

function getCachedNative(): HTMLElement | null {
  return cachedNativeShield ?? (cachedNativeShield = document.getElementById(NATIVE_SHIELD_ID));
}

export function getLockStartedAt(): number {
  return lockedAt;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [data-privacy-allow-copy]"),
  );
}

/** Print Screen, print-to-PDF, and common capture shortcuts. */
export function isScreenshotKey(e: KeyboardEvent): boolean {
  const { code, key, keyCode } = e;
  if (code === "PrintScreen" || key === "PrintScreen" || key === "Snapshot" || keyCode === 44) {
    return true;
  }
  if (key === "Print" && keyCode === 44) return true;
  if (e.altKey && (code === "PrintScreen" || keyCode === 44)) return true;
  if (e.metaKey && e.shiftKey && (key === "3" || key === "4" || key === "5")) return true;
  // macOS Cmd+Shift+S or Windows Win+Shift+S (Snipping Tool)
  if (e.shiftKey && (key === "s" || key === "S") &&
      (e.metaKey || e.getModifierState("Meta") || e.getModifierState("OS"))) {
    return true;
  }
  // Ctrl+P / Cmd+P — print dialog / print-to-PDF
  if ((e.ctrlKey || e.metaKey) && (key === "p" || key === "P")) return true;
  return false;
}

function isAwayFromApp(): boolean {
  return document.visibilityState === "hidden" || !document.hasFocus();
}

function mustStaySealed(): boolean {
  if (requiresExplicitUnlock) return true;
  if (Date.now() < shieldUntil) return true;
  if (isGuestAuthPath()) return false;
  return isAwayFromApp();
}

function applyRootHidden(hidden: boolean): void {
  const root = getCachedRoot();
  if (!root) return;
  if (hidden) {
    root.style.setProperty("visibility", "hidden", "important");
    root.style.setProperty("opacity", "0", "important");
    root.style.setProperty("pointer-events", "none", "important");
  } else {
    root.style.removeProperty("visibility");
    root.style.removeProperty("opacity");
    root.style.removeProperty("pointer-events");
    // Clean up inline backgrounds set by immediateBlackout
    document.documentElement.style.removeProperty("background");
    document.body.style.removeProperty("background");
    // Hide pre-created instant overlay
    if (instantOverlay) instantOverlay.style.opacity = "0";
  }
}

function showNativeShield(show: boolean): void {
  const el = document.getElementById(NATIVE_SHIELD_ID);
  if (!el) return;
  if (show) {
    el.removeAttribute("hidden");
    el.setAttribute("aria-hidden", "false");
  } else {
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
    el.style.removeProperty("display");
    el.style.removeProperty("opacity");
    el.style.removeProperty("visibility");
  }
}

/**
 * Synchronously blacks out the entire viewport via inline styles before the
 * browser has a chance to paint. Called on screenshot key events so that by
 * the time the OS captures the screen, no app content is visible.
 *
 * The instant overlay uses opacity:0→1 (compositor-thread fast path) to avoid
 * triggering a full layout reflow — this is the fastest possible visual blackout.
 */
function immediateBlackout(): void {
  // opacity change on a will-change:opacity + translateZ(0) element is a
  // compositor operation — no main-thread layout required.
  getInstantOverlay().style.opacity = "1";

  document.documentElement.style.setProperty("background", "#0c0a14", "important");
  document.body.style.setProperty("background", "#0c0a14", "important");
  const root = getCachedRoot();
  if (root) {
    root.style.setProperty("visibility", "hidden", "important");
    root.style.setProperty("opacity", "0", "important");
    root.style.setProperty("pointer-events", "none", "important");
  }
  const native = getCachedNative();
  if (native) {
    native.removeAttribute("hidden");
    native.style.setProperty("display", "grid", "important");
    native.style.setProperty("opacity", "1", "important");
    native.style.setProperty("visibility", "visible", "important");
  }
  // Force synchronous layout so the browser flushes style mutations before returning.
  void document.body.offsetHeight;
}

/** Hide all app data immediately (sync). Shield stays outside #root. */
export function sealContent(latchMs = 0): void {
  if (isGuestAuthPath()) return;
  if (latchMs > 0) {
    shieldUntil = Math.max(shieldUntil, Date.now() + latchMs);
  }
  const wasSealed = document.body.classList.contains(SHIELD_CLASS);
  if (!wasSealed) {
    lockedAt = Date.now();
    requiresExplicitUnlock = true;
    try {
      sessionStorage.setItem(SEAL_SESSION_KEY, "1");
      // Only broadcast a real lock (not a temporary screenshot latch) to other tabs.
      if (latchMs === 0) localStorage.removeItem(storageKeys.globalUnlocked);
    } catch { /* storage unavailable */ }
  }
  document.body.classList.add(SHIELD_CLASS);
  applyRootHidden(true);
  showNativeShield(true);
}

/** Unlock only when user explicitly clicks — called from PrivacyShield component. */
export function explicitUnlock(): void {
  shieldUntil = 0;
  lockedAt = 0;
  requiresExplicitUnlock = false;
  try {
    sessionStorage.removeItem(SEAL_SESSION_KEY);
    sessionStorage.setItem(TAB_UNLOCKED_KEY, "1");
    localStorage.setItem(storageKeys.globalUnlocked, "1");
  } catch { /* storage unavailable */ }
  document.body.classList.remove(SHIELD_CLASS);
  applyRootHidden(false);
  showNativeShield(false);
}

/** Always show login/register — never keep shield on guest auth URLs. */
export function releaseGuestAuthShield(): void {
  shieldUntil = 0;
  lockedAt = 0;
  requiresExplicitUnlock = false;
  try {
    sessionStorage.removeItem(TAB_UNLOCKED_KEY);
    localStorage.removeItem(storageKeys.globalUnlocked);
  } catch { /* storage unavailable */ }
  document.body.classList.remove(SHIELD_CLASS);
  applyRootHidden(false);
  showNativeShield(false);
}

export function tryUnsealContent(): void {
  applyGuestAuthDocumentFlag();
  if (isGuestAuthPath()) {
    releaseGuestAuthShield();
    return;
  }
  if (mustStaySealed()) {
    sealContent(0);
    return;
  }
  document.body.classList.remove(SHIELD_CLASS);
  applyRootHidden(false);
  showNativeShield(false);
}

function onScreenshotAttempt(): void {
  if (isScreenshotAllowed()) return;
  sealContent(SHIELD_LATCH_MS);
  dispatchScreenshot();
  void navigator.clipboard?.writeText("").catch(() => {});
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

function onScreenshotKeyEvent(e: KeyboardEvent): void {
  if (isScreenshotAllowed()) return;
  if (!isScreenshotKey(e) && e.code !== "PrintScreen" && e.keyCode !== 44) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  immediateBlackout();
  onScreenshotAttempt();
}

function clearSelectionOutsideFields(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const inField = (node: Node | null) =>
    node instanceof Element
      ? isEditableTarget(node)
      : node?.parentElement != null && isEditableTarget(node.parentElement);
  if (!inField(sel.anchorNode) && !inField(sel.focusNode)) {
    sel.removeAllRanges();
  }
}

function syncSealState(): void {
  if (mustStaySealed()) {
    sealContent(0);
  } else {
    tryUnsealContent();
  }
}

/**
 * Keyboard Lock API — requests that the browser intercept PrintScreen before
 * the OS / desktop environment (GNOME, KDE, macOS Screenshot, etc.) does.
 * Silently no-ops in browsers that don't support the API.
 */
function grabPrintScreenKey(): void {
  const kb = (navigator as { keyboard?: { lock?(keys: string[]): Promise<void> } }).keyboard;
  if (typeof kb?.lock === "function") {
    void kb.lock(["PrintScreen"]).catch(() => {});
  }
}

/** Install before React paints — earliest possible capture protection. */
export function installPrivacySeal(): void {
  if (installed) return;
  installed = true;
  applyGuestAuthDocumentFlag();

  // Restore lock state that persisted across page refresh.
  // Must happen before syncSealState() so the DOM is sealed before React renders.
  // Exception: a page reload triggers window.blur right before unload, which saves a stale
  // SEAL_SESSION_KEY; on reload we discard it so the screen stays unlocked after F5.
  if (!isGuestAuthPath()) {
    try {
      if (sessionStorage.getItem(SEAL_SESSION_KEY) === "1") {
        requiresExplicitUnlock = true;
        lockedAt = lockedAt || Date.now();
      }
      // Inherit unlock state from any already-open tab via the shared localStorage flag.
      // This makes new/duplicated tabs start in the same state as existing tabs.
      if (localStorage.getItem(storageKeys.globalUnlocked) === "1") {
        sessionStorage.setItem(TAB_UNLOCKED_KEY, "1");
      }
      // Lock if session exists but this tab was never explicitly unlocked in any tab.
      const hasSession = Boolean(localStorage.getItem(storageKeys.session));
      const tabUnlocked = sessionStorage.getItem(TAB_UNLOCKED_KEY) === "1";
      if (hasSession && !tabUnlocked) {
        requiresExplicitUnlock = true;
        lockedAt = lockedAt || Date.now();
      }
    } catch { /* storage unavailable */ }
  }

  // Prime element cache and overlay so first immediateBlackout() has zero DOM-lookup cost.
  getCachedRoot();
  getCachedNative();
  getInstantOverlay();

  document.body.classList.add(PROTECTED_CLASS);

  function isPrintScreenEvent(e: KeyboardEvent): boolean {
    return e.key === "PrintScreen" || e.code === "PrintScreen" || e.keyCode === 44;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isScreenshotAllowed()) return;
    // keydown fires on Linux/macOS; on Windows Chrome the OS intercepts PrintScreen
    if (isPrintScreenEvent(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      immediateBlackout();
      sealContent(SHIELD_LATCH_MS);
      dispatchScreenshot();
      return;
    }
    onScreenshotKeyEvent(e);
  }

  function onKeyUp(e: KeyboardEvent) {
    if (isScreenshotAllowed()) return;
    // keyup catches the Windows case where the OS grabs PrintScreen before keydown
    if (isPrintScreenEvent(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      immediateBlackout();
      sealContent(SHIELD_LATCH_MS);
      dispatchScreenshot();
      return;
    }
    onScreenshotKeyEvent(e);
  }

  function onAway() {
    if (isScreenshotAllowed() || isGuestAuthPath()) return;
    immediateBlackout();
    sealContent(0);
    dispatchAway();
    void navigator.clipboard?.writeText("").catch(() => {});
    clearSelectionOutsideFields();
  }

  function onCopy(e: ClipboardEvent) {
    if (isScreenshotAllowed()) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    void navigator.clipboard?.writeText("").catch(() => {});
  }

  function onCut(e: ClipboardEvent) {
    if (isScreenshotAllowed()) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  }

  function onContextMenu(e: MouseEvent) {
    if (isScreenshotAllowed()) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  }

  function onDragStart(e: DragEvent) {
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  }

  function onBeforePrint(e: Event) {
    if (isScreenshotAllowed()) return;
    // e.preventDefault() alone doesn't cancel print in all browsers;
    // immediateBlackout + sealContent ensures the page is hidden before any print rasterization.
    e.preventDefault();
    immediateBlackout();
    onScreenshotAttempt();
  }

  // Register at window level first (capture phase: window fires before document)
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  document.addEventListener("keydown", onKeyDown, { capture: true });
  document.addEventListener("keyup", onKeyUp, { capture: true });
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCut);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("visibilitychange", syncSealState);
  document.addEventListener("selectionchange", clearSelectionOutsideFields);
  document.addEventListener("freeze", onAway);
  window.addEventListener("pagehide", onAway);
  window.addEventListener("blur", onAway);
  window.addEventListener("focus", () => { grabPrintScreenKey(); syncSealState(); });
  window.addEventListener("beforeprint", onBeforePrint);

  // Cross-tab state sync: when another tab locks or unlocks, mirror it here.
  // The "storage" event fires only in OTHER tabs, never the one that wrote the value.
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== storageKeys.globalUnlocked) return;
    if (e.newValue === "1") {
      try { sessionStorage.setItem(TAB_UNLOCKED_KEY, "1"); } catch { /* ignore */ }
      tryUnsealContent();
    } else {
      try { sessionStorage.removeItem(TAB_UNLOCKED_KEY); } catch { /* ignore */ }
      sealContent(0);
    }
  });

  // Keyboard Lock API: tells the browser to capture PrintScreen before the OS.
  // On Linux/GNOME and macOS this prevents the system screenshot handler from
  // firing first. Re-requested on every focus gain because the lock is released
  // when the page loses focus.
  grabPrintScreenKey();

  window.setInterval(syncSealState, POLL_MS);
  window.addEventListener("popstate", syncSealState);

  const wrapHistory = (method: "pushState" | "replaceState") => {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      syncSealState();
    };
  };
  wrapHistory("pushState");
  wrapHistory("replaceState");

  syncSealState();
}
