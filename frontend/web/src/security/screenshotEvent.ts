/**
 * Internal event bus for capture attempts detected by the privacy seal.
 *
 * `vector` describes WHAT was attempted so listeners (telemetry, UI) can
 * react/attribute. Values are coarse on purpose — the browser cannot tell us
 * the exact tool, only which web event fired.
 */
export type CaptureVector =
  | "key" // PrintScreen / Snipping / capture shortcut key
  | "print" // print dialog / print-to-PDF
  | "copy" // copy/cut of protected content
  | "unknown";

type Fn = () => void;
type Listener = (vector: CaptureVector) => void;

/** Legacy single-slot callback (used by LockContext to flash the block UI). */
let screenshotCb: Fn | null = null;
/** Multi-subscriber listeners (telemetry, SDK consumers). */
const listeners = new Set<Listener>();

export function setScreenshotCb(fn: Fn | null): void {
  screenshotCb = fn;
}

/** Subscribe to every capture attempt. Returns an unsubscribe function. */
export function addScreenshotListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function dispatchScreenshot(vector: CaptureVector = "unknown"): void {
  screenshotCb?.();
  for (const listener of listeners) {
    try {
      listener(vector);
    } catch {
      /* a broken listener must never block the others */
    }
  }
}
