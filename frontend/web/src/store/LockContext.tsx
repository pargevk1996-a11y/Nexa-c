import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sealContent, explicitUnlock } from "@/security/privacySeal";
import { setScreenshotCb } from "@/security/screenshotEvent";
import { setAwayCb } from "@/security/awayEvent";
import { isGuestAuthPath } from "@/security/authRoutes";

/** Absence (ms) beyond which returning to the tab requires the PIN, not just a
 *  click. Below it, a single click on the security screen continues. */
const AWAY_PIN_THRESHOLD_MS = 60_000;

// Legacy persisted-lock keys from the old auto-lock system. Clear them on load
// so a stale value can never boot the app into a locked state ("auto-locks").
try {
  localStorage.removeItem("_nxlr");
  localStorage.removeItem("_nxla");
} catch {
  /* storage unavailable */
}

/**
 * The screen lock is USER-INITIATED and SESSION-ONLY: it is never restored on
 * page load / reload (a fresh page is always unlocked), and there is NO
 * automatic locking on tab-switch, blur or inactivity. The only triggers are
 * the padlock button (manual `pin_required`) and a screenshot attempt
 * (`screenshot_blocked`, click to dismiss). A manual lock needs the PIN.
 */
export type LockState = "active" | "pin_required" | "screenshot_blocked" | "away";

interface LockContextValue {
  lockState: LockState;
  lockedAt: number;
  /** Lock the screen. `pin_required` = manual lock (PIN needed to unlock). */
  lock(reason: Exclude<LockState, "active">): void;
  unlock(): void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  // Always boot unlocked — no persisted/restored lock state.
  const [lockState, setLockState] = useState<LockState>("active");
  const [lockedAt, setLockedAt] = useState<number>(0);

  const lockStateRef = useRef<LockState>("active");
  lockStateRef.current = lockState;

  const lock = useCallback((reason: Exclude<LockState, "active">) => {
    if (isGuestAuthPath()) return;
    const current = lockStateRef.current;
    // A manual PIN lock is sticky; re-locking the same way is a no-op.
    if (current === "pin_required") return;
    if (current === "screenshot_blocked" && reason === "screenshot_blocked") return;
    // Never downgrade an existing lock to the lighter "away" screen.
    if (current !== "active" && reason === "away") return;
    sealContent(0);
    setLockedAt(Date.now());
    setLockState(reason);
  }, []);

  const unlock = useCallback(() => {
    explicitUnlock();
    setLockState("active");
    setLockedAt(0);
  }, []);

  // Screenshot / print-capture attempts still flash a (click-to-dismiss) block.
  useEffect(() => {
    setScreenshotCb(() => lock("screenshot_blocked"));
    return () => setScreenshotCb(null);
  }, [lock]);

  // Returning to the tab after being away shows the recoverable security screen:
  // a single click continues for brief absences; a longer one requires the PIN.
  useEffect(() => {
    setAwayCb((awayMs) => lock(awayMs >= AWAY_PIN_THRESHOLD_MS ? "pin_required" : "away"));
    return () => setAwayCb(null);
  }, [lock]);

  return (
    <LockContext.Provider value={{ lockState, lockedAt, lock, unlock }}>
      {children}
    </LockContext.Provider>
  );
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used within LockProvider");
  return ctx;
}
