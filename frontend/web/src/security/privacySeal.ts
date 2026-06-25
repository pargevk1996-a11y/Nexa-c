import { applyGuestAuthDocumentFlag, isGuestAuthPath } from "./authRoutes";
import { isScreenshotAllowed } from "./screenshotPolicy";
import { dispatchScreenshot, type CaptureVector } from "./screenshotEvent";
import { dispatchAway } from "./awayEvent";
import { storageKeys } from "./storageKeys";

const TAB_UNLOCKED_KEY = "_nxtu";

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
/** Shield stays until the user explicitly unlocks — set by a manual lock. */
let requiresExplicitUnlock = false;
/**
 * Instant blackout shown while our page does NOT have focus (Alt+Tab, Cmd+Tab,
 * Win/Super key, app/tab switch, mobile app switcher) — protects the OS
 * app-switcher thumbnail. On RETURN it is ALWAYS cleared and handed to the React
 * lock overlay (recoverable "click to continue" / PIN), so the user can never be
 * trapped on a dead black screen. Distinct from the manual PIN lock.
 */
let awayArmed = false;
/** When the page went hidden/blurred — used to pick click-to-continue vs PIN. */
let hiddenAt = 0;
/** True only when the page was actually BACKGROUNDED (visibilitychange→hidden),
 *  not merely blurred (file picker, dialog, devtools, Alt+Tab to another app).
 *  Gates the recoverable security screen so it doesn't pop on every file attach. */
let wasBackgrounded = false;

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
  // z-index one below the React lock overlay (2147483647) so a recoverable
  // "click to continue" / PIN screen always renders ABOVE this raw blackout.
  instantOverlay.style.cssText =
    "opacity:0;position:fixed;inset:0;z-index:2147483646;background:#0c0a14;pointer-events:none;will-change:opacity;transform:translateZ(0);";
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

function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) return /win/i.test(uaData.platform);
  return /win/i.test(navigator.platform || navigator.userAgent || "");
}

/**
 * Every known screen-capture / screenshot shortcut across all OSes, plus
 * print-to-PDF. Matches regardless of which fields the browser/keyboard reports
 * (`key`, `code`, legacy `keyCode`). The Meta/Super/Win key is read via both
 * `metaKey` and `getModifierState("Meta"|"OS")` for old-browser coverage.
 *
 * HONEST LIMIT: most of these are GLOBAL OS hotkeys the browser never delivers to
 * the page (PrintScreen, Win+Shift+S, Cmd+Shift+4…), so `preventDefault()` cannot
 * stop the OS capture. This matcher fires the blackout deterrent in the cases the
 * page DOES receive the event, and pairs with the focus-loss seal (which catches
 * the overlay-based tools — Snip, Game Bar — via blur) and the Keyboard Lock API.
 */
export function isScreenshotKey(e: KeyboardEvent): boolean {
  const { code, keyCode } = e;
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const meta =
    e.metaKey ||
    e.getModifierState?.("Meta") ||
    e.getModifierState?.("OS") ||
    false;
  const { ctrlKey: ctrl, altKey: alt, shiftKey: shift } = e;

  // ── PrintScreen in every reported form, any modifier combination ──
  // Windows: PrtSc / Alt+PrtSc (window) / Win+PrtSc (file) / Win+Alt+PrtSc (Game Bar).
  // Linux GNOME/KDE: PrtSc / Shift|Ctrl|Alt|Meta+PrtSc (area / clipboard / window).
  // Some external keyboards report the dedicated capture key as F13.
  if (
    code === "PrintScreen" ||
    key === "PrintScreen" ||
    key === "Snapshot" ||
    key === "Print" ||
    keyCode === 44 ||
    code === "F13"
  ) {
    return true;
  }

  // ── macOS: Cmd+Shift+3/4/5/6 (adding Ctrl just copies to clipboard) ──
  if (meta && shift && (lower === "3" || lower === "4" || lower === "5" || lower === "6")) {
    return true;
  }

  // ── Snipping tools: Win+Shift+S (Windows), Cmd+Shift+S (macOS),
  //    Meta+Shift+S (KDE Spectacle region) ──
  if (meta && shift && lower === "s") return true;

  // ── Windows Xbox Game Bar (capture/record). Gated to Windows so it doesn't
  //    swallow macOS Cmd+G (find-next) / Cmd+Alt+R etc. ──
  if (isWindowsPlatform() && meta) {
    if (lower === "g") return true; // Win+G opens the Game Bar
    if (alt && (lower === "r" || lower === "g")) return true; // Win+Alt+R / Win+Alt+G record
  }

  // ── Screen RECORDING combos ──
  // GNOME built-in screen recorder (Ubuntu/Fedora/PopOS etc.): Ctrl+Alt+Shift+R
  if (ctrl && alt && shift && lower === "r") return true;
  // KDE / some distros: Meta+Shift+R (e.g. Peek, Kooha, GNOME Shell extensions)
  if (meta && shift && lower === "r") return true;
  // macOS Cmd+Ctrl+Esc — legacy QuickTime screen recording shortcut in some versions
  if (meta && ctrl && e.key === "Escape") return true;
  // Shift+Ctrl+PrtSc is already caught by base PrintScreen branch above.
  // Meta+Alt+R (some desktops, Win+Alt+R Windows Game Bar via second path)
  if (meta && alt && lower === "r") return true;

  // ── Print / print-to-PDF: Ctrl+P / Cmd+P ──
  if ((ctrl || meta) && lower === "p") return true;

  return false;
}

function mustStaySealed(): boolean {
  // The lock is USER-INITIATED only. No tab-away / visibility / inactivity
  // sealing. Stay sealed solely for a manual lock or a transient screenshot latch.
  if (isGuestAuthPath()) return false;
  if (requiresExplicitUnlock) return true;
  if (Date.now() < shieldUntil) return true;
  return false;
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
      if (latchMs === 0) localStorage.removeItem("_nxgu");
    } catch { /* storage unavailable */ }
  } else {
    // Lock overlay is already rendered — fade the instant blackout overlay so the
    // lock UI (PIN form, logo) is visible. The lock overlay's own background keeps
    // app content hidden; the instant overlay is only needed for the initial flash.
    if (instantOverlay) {
      instantOverlay.style.transition = "opacity 200ms";
      instantOverlay.style.opacity = "0";
    }
  }
  document.body.classList.add(SHIELD_CLASS);
  applyRootHidden(true);
  showNativeShield(true);
}

/** Unlock — called after a successful PIN entry on the manual lock. */
export function explicitUnlock(): void {
  shieldUntil = 0;
  lockedAt = 0;
  requiresExplicitUnlock = false;
  try {
    sessionStorage.removeItem(SEAL_SESSION_KEY);
    sessionStorage.setItem(TAB_UNLOCKED_KEY, "1");
    localStorage.setItem("_nxgu", "1");
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
    localStorage.removeItem("_nxgu");
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

function onScreenshotAttempt(vector: CaptureVector = "unknown"): void {
  if (isScreenshotAllowed()) return;
  sealContent(SHIELD_LATCH_MS);
  dispatchScreenshot(vector);
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
  onScreenshotAttempt("key");
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
  } else if (awayArmed) {
    // We are unfocused: keep the blackout up so the OS app-switcher thumbnail /
    // any tool we switched to cannot read our content. The poll must not unseal.
  } else {
    tryUnsealContent();
  }
}

/** Key combos that move focus AWAY from our page. The OS eats most of these
 *  (Alt+Tab / Cmd+Tab / Win key) before the page sees them — blur/visibilitychange
 *  is the reliable cross-platform catch — but when we DO see them we seal a beat
 *  sooner. Bare Meta/Cmd is intentionally excluded (it would fire on Cmd+C etc.). */
export function isFocusChangingKey(e: KeyboardEvent): boolean {
  const k = e.key;
  if (e.altKey && k === "Tab") return true; // app switcher (Win/Linux)
  if (e.metaKey && (k === "Tab" || k === "`")) return true; // macOS app/window switch
  if (e.ctrlKey && (k === "Tab" || k === "PageUp" || k === "PageDown")) return true; // tab switch
  if ((e.ctrlKey || e.metaKey) && /^[twnTWNlL]$/.test(k)) return true; // new/close tab, new window, address bar
  if (k === "F6") return true; // focus address bar
  if (e.altKey && (k === "d" || k === "D")) return true; // address bar (Windows)
  return false;
}

/** Reverse immediateBlackout() WITHOUT touching lock state — the guaranteed,
 *  unconditional recovery path so the user is never trapped behind the blackout. */
function clearBlackout(): void {
  applyRootHidden(false);
  showNativeShield(false);
}

/** Black out instantly when focus leaves our page (protects the app-switcher
 *  thumbnail). Recorded so the return handler can offer a recoverable unlock. */
function armAwayBlackout(): void {
  if (isScreenshotAllowed()) return;
  if (isGuestAuthPath()) return;
  // A manual / screenshot lock already owns the screen (recoverable via its own
  // overlay) — don't layer the away blackout on top of it.
  if (requiresExplicitUnlock) return;
  if (!awayArmed) hiddenAt = Date.now();
  awayArmed = true;
  immediateBlackout();
}

/**
 * On return to the tab/app: ALWAYS leave a recoverable state — never a dead black
 * screen. Hands off to the React lock overlay (click-to-continue if the absence
 * was brief, PIN if long). If nothing is listening (e.g. no app mounted), it just
 * reveals the app. A manual/screenshot lock, if active, keeps its own overlay.
 */
function onReturnFromAway(): void {
  grabPrintScreenKey();
  if (!awayArmed) return;
  awayArmed = false;
  const awayMs = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
  hiddenAt = 0;
  const backgrounded = wasBackgrounded;
  wasBackgrounded = false;
  // A real manual/screenshot lock took over while away — its recoverable overlay
  // (z-index above the blackout) owns the screen; leave it be.
  if (requiresExplicitUnlock) return;
  // Brief blur only (file picker / dialog / app switch), or capture is allowed /
  // guest auth: never show the security screen — just reveal the app.
  if (!backgrounded || isScreenshotAllowed() || isGuestAuthPath()) {
    clearBlackout();
    return;
  }
  // Real tab backgrounding: ask React to show the recoverable security overlay.
  // sealContent() (invoked by the lock) keeps content hidden behind the overlay;
  // on unlock the blackout clears. If NOBODY handles it, reveal so nothing sticks.
  const handled = dispatchAway(awayMs);
  if (!handled) clearBlackout();
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

  // NOTE: no auto-lock on load. The lock is user-initiated (padlock button) and
  // its persistence across reload is restored by LockContext (which calls
  // sealContent() on mount when a manual lock was active). The screen never
  // locks itself on first load, tab-switch or inactivity.

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
      dispatchScreenshot("key");
      return;
    }
    // Focus-changing combo (Alt+Tab, Cmd+Tab, Ctrl/Cmd+W/T, address bar…): black
    // out a beat before the window blurs. We do NOT preventDefault — the user is
    // allowed to switch; we only protect our content behind them.
    if (isFocusChangingKey(e)) {
      armAwayBlackout();
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
      dispatchScreenshot("key");
      return;
    }
    onScreenshotKeyEvent(e);
  }


  function onCopy(e: ClipboardEvent) {
    if (isScreenshotAllowed()) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    void navigator.clipboard?.writeText("").catch(() => {});
    dispatchScreenshot("copy");
  }

  function onCut(e: ClipboardEvent) {
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
    onScreenshotAttempt("print");
  }

  // Register at window level first (capture phase: window fires before document)
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  document.addEventListener("keydown", onKeyDown, { capture: true });
  document.addEventListener("keyup", onKeyUp, { capture: true });
  document.addEventListener("copy", onCopy);
  document.addEventListener("cut", onCut);
  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("selectionchange", clearSelectionOutsideFields);
  // Focus-loss protection — cross-platform (all devices/OS/browsers): any
  // app/tab/window switch, the OS app switcher (Alt+Tab / Cmd+Tab / Win key) and
  // the mobile app switcher all fire blur and/or visibilitychange even though the
  // page never receives the keystroke. We black out INSTANTLY while away (protects
  // the switcher thumbnail), then on return ALWAYS hand off to the recoverable
  // React security overlay — never a stuck black screen. `pageshow` covers
  // bfcache restores (back/forward) which don't always fire focus/visibilitychange.
  window.addEventListener("blur", armAwayBlackout);
  window.addEventListener("pagehide", () => { wasBackgrounded = true; armAwayBlackout(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      wasBackgrounded = true; // real tab background → recoverable security screen on return
      armAwayBlackout();
    } else {
      onReturnFromAway();
    }
  });
  window.addEventListener("focus", onReturnFromAway);
  window.addEventListener("pageshow", onReturnFromAway);
  window.addEventListener("beforeprint", onBeforePrint);

  // Cross-tab state sync: when another tab locks or unlocks, mirror it here.
  // The "storage" event fires only in OTHER tabs, never the one that wrote the value.
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== "_nxgu") return;
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
