/**
 * Bridge from the (non-React) privacy seal to the React LockContext for the
 * "returned to the tab after being away" event. Mirrors screenshotEvent.ts.
 *
 * `awayMs` is how long the page was hidden/blurred, so the UI can decide between
 * a click-to-continue security screen (short absence) and a PIN prompt (long one).
 */
type AwayCb = (awayMs: number) => void;

let awayCb: AwayCb | null = null;

export function setAwayCb(cb: AwayCb | null): void {
  awayCb = cb;
}

/** Returns true if a listener handled it (so the seal knows the React overlay
 *  will take over and it should NOT just silently reveal the app). */
export function dispatchAway(awayMs: number): boolean {
  if (!awayCb) return false;
  awayCb(awayMs);
  return true;
}
