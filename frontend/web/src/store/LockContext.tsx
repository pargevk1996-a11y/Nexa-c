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
import { fetchScreenLock, setScreenLock } from "@/api/profile";

// Legacy persisted-lock keys from the old auto-lock system. Clear them on load
// so a stale value from that system can never affect the new lock.
try {
  localStorage.removeItem("_nxlr");
  localStorage.removeItem("_nxla");
} catch {
  /* storage unavailable */
}

// Local fast-path cache of the ACCOUNT-WIDE manual-lock flag. The server is the
// source of truth (so the lock follows the account across every browser / OS /
// device), but we also mirror it in localStorage so a reload restores the lock
// INSTANTLY — before the network round-trip — with no unlocked flash. The lock
// stays until the correct PIN is entered. Only the lock STATE is stored here and
// on the server, never the PIN itself.
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
  const lockedAtRef = useRef<number>(lockedAt);
  lockedAtRef.current = lockedAt;

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
    // Only a manual padlock lock persists; transient screens do not. Mirror it
    // locally (instant restore) and push to the server (account-wide).
    if (reason === "pin_required") {
      persistManualLock(true);
      void setScreenLock(true).catch(() => {});
    }
  }, []);

  const unlock = useCallback(() => {
    // Clear the lock locally first (so a reload mid-unlock can't re-lock), then
    // on the server so every other device of the account unlocks too.
    persistManualLock(false);
    void setScreenLock(false).catch(() => {});
    explicitUnlock();
    setLockState("active");
    setLockedAt(0);
  }, []);

  // Screenshot / print-capture attempts still flash a (click-to-dismiss) block.
  useEffect(() => {
    setScreenshotCb(() => lock("screenshot_blocked"));
    return () => setScreenshotCb(null);
  }, [lock]);

  // Account-wide sync: the server is the source of truth. On boot — and whenever
  // the session (re)hydrates — fetch the flag and make THIS device match it, so
  // opening the account in any other browser/OS/device reflects the lock, and a
  // PIN-unlock on one device clears it everywhere.
  useEffect(() => {
    let cancelled = false;
    async function reconcile() {
      if (isGuestAuthPath()) return;
      let serverLocked: boolean;
      try {
        serverLocked = await fetchScreenLock();
      } catch {
        return; // offline / not authenticated yet — keep the optimistic local state
      }
      if (cancelled) return;
      if (serverLocked) {
        if (lockStateRef.current === "active") {
          sealContent(0);
          setLockedAt(Date.now());
          setLockState("pin_required");
        }
        persistManualLock(true);
      } else if (lockStateRef.current === "pin_required") {
        // Honour a server-side unlock — unless WE locked moments ago and our own
        // write may still be in flight (avoids a rare refresh-race self-unlock).
        if (Date.now() - lockedAtRef.current > 5000) {
          explicitUnlock();
          setLockState("active");
          setLockedAt(0);
          persistManualLock(false);
        }
      } else {
        persistManualLock(false);
      }
    }
    void reconcile();
    const onSession = () => void reconcile();
    window.addEventListener("securechat-session", onSession);
    return () => {
      cancelled = true;
      window.removeEventListener("securechat-session", onSession);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
