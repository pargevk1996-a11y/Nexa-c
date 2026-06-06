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
import { setScreenshotCb, setAwayCb } from "@/security/screenshotEvent";
import { isGuestAuthPath } from "@/security/authRoutes";

/** How long without activity before requiring PIN directly. */
const INACTIVITY_MS = 120_000;
/** How long in locked_click state before escalating to PIN. */
const PIN_ESCALATION_MS = 60_000;

const LOCK_REASON_KEY = "_nxlr";
const LOCK_AT_KEY = "_nxla";

function readPersistedLock(): { state: LockState; at: number } | null {
  try {
    const reason = localStorage.getItem(LOCK_REASON_KEY) as LockState | null;
    if (!reason || reason === "active") return null;
    const at = parseInt(localStorage.getItem(LOCK_AT_KEY) ?? "0", 10) || Date.now();
    // locked_click escalates to pin_required if enough time passed while page was closed
    if (reason === "locked_click" && Date.now() - at >= PIN_ESCALATION_MS) {
      return { state: "pin_required", at };
    }
    return { state: reason, at };
  } catch {
    return null;
  }
}

function persistLock(state: LockState, at: number): void {
  try {
    if (state === "active") {
      localStorage.removeItem(LOCK_REASON_KEY);
      localStorage.removeItem(LOCK_AT_KEY);
    } else {
      localStorage.setItem(LOCK_REASON_KEY, state);
      localStorage.setItem(LOCK_AT_KEY, String(at));
    }
  } catch { /* storage unavailable */ }
}

export type LockState = "active" | "locked_click" | "pin_required" | "screenshot_blocked";

interface LockContextValue {
  lockState: LockState;
  lockedAt: number;
  lock(reason: Exclude<LockState, "active">): void;
  unlock(): void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [lockState, setLockState] = useState<LockState>(() => {
    if (isGuestAuthPath()) return "active";
    return readPersistedLock()?.state ?? "active";
  });
  const [lockedAt, setLockedAt] = useState<number>(() => {
    if (isGuestAuthPath()) return 0;
    return readPersistedLock()?.at ?? 0;
  });

  // Refs for use inside callbacks/intervals without stale closures
  const lockStateRef = useRef<LockState>("active");
  const lockedAtRef = useRef(0);
  const lastActivityRef = useRef(Date.now());

  lockStateRef.current = lockState;
  lockedAtRef.current = lockedAt;

  const lock = useCallback((reason: Exclude<LockState, "active">) => {
    if (isGuestAuthPath()) return;
    const current = lockStateRef.current;
    if (current === "pin_required" && reason !== "screenshot_blocked") return;
    if (current === "screenshot_blocked") return;

    sealContent(0);
    const at = current === "active" ? Date.now() : lockedAtRef.current;
    if (current === "active") setLockedAt(at);
    setLockState(reason);
    persistLock(reason, at);
  }, []);

  const unlock = useCallback(() => {
    explicitUnlock();
    persistLock("active", 0);
    setLockState("active");
    setLockedAt(0);
    lastActivityRef.current = Date.now();
  }, []);

  // Subscribe to privacySeal native events
  useEffect(() => {
    setScreenshotCb(() => lock("screenshot_blocked"));
    setAwayCb(() => lock("locked_click"));
    return () => {
      setScreenshotCb(null);
      setAwayCb(null);
    };
  }, [lock]);

  // Track activity — only resets timer while active
  useEffect(() => {
    function onActivity() {
      if (lockStateRef.current === "active") lastActivityRef.current = Date.now();
    }
    const opts = { passive: true } as const;
    window.addEventListener("mousemove", onActivity, opts);
    window.addEventListener("click", onActivity, opts);
    window.addEventListener("keydown", onActivity, opts);
    window.addEventListener("touchstart", onActivity, opts);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, []);

  // Sync lock state across browser tabs via localStorage storage event
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LOCK_REASON_KEY && e.key !== LOCK_AT_KEY) return;
      if (isGuestAuthPath()) return;
      const persisted = readPersistedLock();
      if (persisted) {
        sealContent(0);
        setLockState(persisted.state);
        setLockedAt(persisted.at);
      } else {
        // Another tab unlocked — mirror it
        setLockState("active");
        setLockedAt(0);
        lastActivityRef.current = Date.now();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Inactivity timer + PIN escalation
  useEffect(() => {
    const id = setInterval(() => {
      if (isGuestAuthPath()) return;
      const state = lockStateRef.current;
      const now = Date.now();

      if (state === "active") {
        if (now - lastActivityRef.current >= INACTIVITY_MS) {
          lock("pin_required");
        }
      } else if (state === "locked_click") {
        const at = lockedAtRef.current;
        if (at > 0 && now - at >= PIN_ESCALATION_MS) {
          sealContent(0);
          setLockState("pin_required");
          persistLock("pin_required", at);
        }
      }
    }, 1_000);
    return () => clearInterval(id);
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
