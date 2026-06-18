/**
 * Lightweight runtime performance governor.
 *
 * Continuously watches the main thread for sustained jank (Long Tasks). When the
 * device starts to struggle it flips the app into a "lite" mode
 * (`<html data-perf="lite">`) that drops the most expensive visual effects
 * (backdrop blur, ambient animations) so scrolling and interactions stay smooth.
 * It relaxes back to full quality automatically once the jank clears.
 *
 * Self-contained and safe: where `PerformanceObserver`/longtask isn't supported
 * it simply stays in full mode and does nothing.
 */

const THRESHOLD_MS = 220; // accumulated long-task time (within the window) to go lite
const WINDOW_MS = 4000; // decay window for the jank budget
const RELAX_RATIO = 0.4; // drop back to full once budget falls below this fraction

let started = false;
let jankBudget = 0;
let lastDecay = 0;
let lite = false;

function setMode(toLite: boolean): void {
  if (toLite === lite) return;
  lite = toLite;
  document.documentElement.dataset.perf = toLite ? "lite" : "full";
}

function decay(now: number): void {
  const elapsed = now - lastDecay;
  if (elapsed > 0) {
    jankBudget = Math.max(0, jankBudget - (elapsed / WINDOW_MS) * THRESHOLD_MS);
    lastDecay = now;
  }
}

export function startPerformanceGovernor(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  document.documentElement.dataset.perf = "full";

  lastDecay = performance.now();

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const observer = new PerformanceObserver((list) => {
        decay(performance.now());
        for (const entry of list.getEntries()) jankBudget += entry.duration;
        if (jankBudget > THRESHOLD_MS) setMode(true);
        else if (jankBudget < THRESHOLD_MS * RELAX_RATIO) setMode(false);
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      /* longtask entry type unsupported — stay in full mode */
    }
  }

  // Steady relaxation: when no long tasks are firing, bleed the budget down and
  // return to full quality.
  window.setInterval(() => {
    decay(performance.now());
    if (jankBudget < THRESHOLD_MS * RELAX_RATIO) setMode(false);
  }, 2000);
}
