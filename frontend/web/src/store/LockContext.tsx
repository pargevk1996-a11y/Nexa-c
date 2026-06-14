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
import { isGuestAuthPath } from "@/security/authRoutes";

// Legacy persisted-lock keys from the old auto-lock system. Clear them on load
// so a stale value from that system can never affect the new lock.
try {
  localStorage.removeItem("_nxlr");
  localStorage.removeItem("_nxla");
} catch {
  /* storage unavailable */
}

// Persisted manual-lock flag. A user-initiated padlock lock (`pin_required`)
// must survive a full page reload — in any browser / OS / device — and stay
// locked until the correct PIN is entered. Only this manual lock is persisted;
// the transient screens (screenshot_blocked / away) are never stored. We only
// persist the lock STATE, never the PIN itself.
const LOCK_PERSIST_KEY = "nexa-screen-lock";

function isManualLockPersisted(): boolean {
  try {
    return localStorage.getItem(LOCK_PERSIST_KEY) === "pin_required";
  } catch {
    return false;
  }
}

function persistManualLock(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(LOCK_PERSIST_KEY, "pin_required");
    else localStorage.removeItem(LOCK_PERSIST_KEY);
  } catch {
    /* storage unavailable — best effort */
  }
}

/**
 * The screen lock is USER-INITIATED. A manual padlock lock (`pin_required`) is
 * PERSISTENT: it is restored on page load / reload and can only be cleared by
 * entering the PIN. There is still NO automatic locking on tab-switch, blur or
 * inactivity; the transient `screenshot_blocked` / `away` screens are session-
 * only (click to dismiss) and are never persisted.
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
  // Restore a persisted manual lock on boot so a reload stays locked until the
  // PIN is entered. Guest auth pages never carry a lock.
  const [lockState, setLockState] = useState<LockState>(() =>
    !isGuestAuthPath() && isManualLockPersisted() ? "pin_required" : "active",
  );
  const [lockedAt, setLockedAt] = useState<number>(0);

  const lockStateRef = useRef<LockState>(lockState);
  lockStateRef.current = lockState;

  // If we booted into a restored manual lock, seal the content immediately so it
  // stays hidden behind the overlay (and against screenshots) from first paint.
  useEffect(() => {
    if (lockStateRef.current === "pin_required") sealContent(0);
    // Mount-only: the restored lock is established before any user interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Only a manual padlock lock survives a reload; transient screens do not.
    if (reason === "pin_required") persistManualLock(true);
  }, []);

  const unlock = useCallback(() => {
    // Clear the persisted lock first so a reload mid-unlock can't re-lock.
    persistManualLock(false);
    explicitUnlock();
    setLockState("active");
    setLockedAt(0);
  }, []);

  // Screenshot / print-capture attempts still flash a (click-to-dismiss) block.
  useEffect(() => {
    setScreenshotCb(() => lock("screenshot_blocked"));
    return () => setScreenshotCb(null);
  }, [lock]);

  // NOTE: there is intentionally NO automatic lock on inactivity / tab-switch /
  // returning from the background. The screen only locks when the user taps the
  // padlock (manual pin_required) or on a screenshot attempt. (Removed the
  // away/inactivity auto-lock per product decision.)

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
