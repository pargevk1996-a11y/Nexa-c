/**
 * screenCaptureDefense — the public, single-entry API for the web app's
 * best-effort screen-capture defense.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HONEST SCOPE — read before relying on this.
 *
 * A browser CANNOT block or even reliably detect a screenshot. The OS owns the
 * screen; no web API grants a page the power to stop Win+Shift+S, macOS
 * Cmd+Shift+4, the mobile screenshot gesture, a third-party capture tool, OS
 * screen recording, or a camera pointed at the monitor. This module is a
 * DETERRENT, not a guarantee.
 *
 * What it actually does (consolidated behind one API):
 *   • Blacks out the viewport on the PrintScreen / Snipping-Tool key (privacySeal)
 *   • Cancels print / print-to-PDF (Ctrl/Cmd+P, beforeprint)
 *   • Blocks copy / cut / drag / context-menu on protected content
 *   • Fires `onAttempt` and POSTs telemetry for every detected attempt
 *
 * REAL blocking only exists in the native wrappers: Android FLAG_SECURE and the
 * desktop content-protection flag. For guaranteed protection, ship sensitive
 * content through those apps.
 *
 * NOTE: this module deliberately does NOT wrap `getDisplayMedia` — the app uses
 * it for legitimate screen-sharing in calls (see CallEngine), and hijacking it
 * would break that feature while providing no protection against OS recording.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { installPrivacySeal } from "./privacySeal";
import { addScreenshotListener, type CaptureVector } from "./screenshotEvent";
import { isScreenshotAllowed, setScreenshotAllowed } from "./screenshotPolicy";

const DEFAULT_REPORT_ENDPOINT = "/api/v1/security/capture-attempt";

export interface CaptureAttempt {
  /** Which web event fired. Coarse — the browser cannot identify the exact tool. */
  vector: CaptureVector;
  /** Epoch ms when the attempt was detected. */
  at: number;
  /** SPA path the user was on. */
  path: string;
}

export interface ScreenCaptureDefenseOptions {
  /** Invoked synchronously for every detected attempt. */
  onAttempt?: (attempt: CaptureAttempt) => void;
  /** POST a telemetry record to the backend per attempt. Default: true. */
  report?: boolean;
  /** Override the telemetry endpoint. Default: `/api/v1/security/capture-attempt`. */
  reportEndpoint?: string;
}

let teardown: (() => void) | null = null;

/**
 * Best-effort, fire-and-forget telemetry. Uses sendBeacon (survives unload,
 * no preflight) and falls back to keepalive fetch. Never throws, never blocks
 * the capture-defense path.
 */
function reportAttempt(endpoint: string, attempt: CaptureAttempt): void {
  let body: string;
  try {
    body = JSON.stringify({
      vector: attempt.vector,
      path: attempt.path,
      at: attempt.at,
      userAgent: navigator.userAgent,
    });
  } catch {
    return;
  }

  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* telemetry is never allowed to surface an error */
  }
}

/**
 * Initialise the web app's screen-capture defense. Idempotent — calling it
 * again replaces the previous configuration. Returns a teardown function that
 * detaches the telemetry/onAttempt listener (the underlying capture deterrents
 * installed by privacySeal stay active for the page's lifetime by design).
 */
export function initScreenCaptureDefense(
  options: ScreenCaptureDefenseOptions = {},
): () => void {
  const {
    onAttempt,
    report = true,
    reportEndpoint = DEFAULT_REPORT_ENDPOINT,
  } = options;

  // Core deterrents (PrintScreen blackout, print/copy/drag blocking). Idempotent:
  // also installed from main.tsx before first paint.
  installPrivacySeal();

  // Replace any prior subscription so repeated init() calls don't stack listeners.
  teardown?.();

  const unsubscribe = addScreenshotListener((vector) => {
    const attempt: CaptureAttempt = {
      vector,
      at: Date.now(),
      path: typeof location !== "undefined" ? location.pathname : "",
    };
    try {
      onAttempt?.(attempt);
    } catch {
      /* a consumer callback must not break telemetry */
    }
    if (report) reportAttempt(reportEndpoint, attempt);
  });

  teardown = () => {
    unsubscribe();
    teardown = null;
  };
  return teardown;
}

/**
 * Toggle the runtime capture policy. `allowed = true` lifts all deterrents
 * (e.g. for an explicitly public/marketing route). Default policy is blocked.
 */
export function setScreenCaptureAllowed(allowed: boolean): void {
  setScreenshotAllowed(allowed);
}

/** Whether capture is currently permitted (deterrents lifted). */
export function isScreenCaptureAllowed(): boolean {
  return isScreenshotAllowed();
}
