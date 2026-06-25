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
import { cancelPinSetup, getPinStatus, lockSession as lockSessionApi, setupPin, verifyPin } from "@/api/auth";
import { ApiError } from "@/api/client";

// Clear legacy lock keys from old system.
try {
  localStorage.removeItem("_nxlr");
  localStorage.removeItem("_nxla");
  localStorage.removeItem("nexa-screen-lock");
  sessionStorage.removeItem("_nxtu");
} catch { /* ignore */ }

const PIN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export type LockState = "active" | "screenshot_blocked" | "away" | "pin_setup" | "pin_required";

interface LockContextValue {
  lockState: LockState;
  lockedAt: number;
  pinError: string | null;
  lock(reason: Exclude<LockState, "active">): void;
  unlock(): void;
  onPinSetup(pin: string): Promise<void>;
  onPinVerify(pin: string): Promise<void>;
  onPinCancel(): Promise<void>;
  lockSession(): Promise<void>;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [lockState, setLockState] = useState<LockState>("active");
  const [lockedAt, setLockedAt] = useState<number>(0);
  const [pinError, setPinError] = useState<string | null>(null);
  const pinVerifiedAtRef = useRef<number>(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockStateRef = useRef<LockState>(lockState);
  lockStateRef.current = lockState;

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (pinVerifiedAtRef.current === 0) return;
    inactivityTimerRef.current = setTimeout(() => {
      if (!isGuestAuthPath()) {
        setLockState("pin_required");
        setLockedAt(Date.now());
        pinVerifiedAtRef.current = 0;
      }
    }, PIN_TIMEOUT_MS);
  }, []);

  const lock = useCallback((reason: Exclude<LockState, "active">) => {
    if (isGuestAuthPath()) return;
    const current = lockStateRef.current;
    if (current === "screenshot_blocked" && reason === "screenshot_blocked") return;
    if (current !== "active" && reason === "away") return;
    if (reason === "screenshot_blocked" || reason === "away") {
      sealContent(0);
    }
    setLockedAt(Date.now());
    setLockState(reason);
  }, []);

  const unlock = useCallback(() => {
    explicitUnlock();
    setLockState("active");
    setLockedAt(0);
  }, []);

  const onPinSetup = useCallback(async (pin: string) => {
    setPinError(null);
    try {
      await setupPin(pin);
      pinVerifiedAtRef.current = Date.now();
      setLockState("active");
      setLockedAt(0);
      resetInactivityTimer();
    } catch (e) {
      if (e instanceof ApiError) {
        setPinError(e.message);
      } else {
        setPinError("Failed to set PIN. Please try again.");
      }
    }
  }, [resetInactivityTimer]);

  const onPinVerify = useCallback(async (pin: string) => {
    setPinError(null);
    try {
      await verifyPin(pin);
      pinVerifiedAtRef.current = Date.now();
      setLockState("active");
      setLockedAt(0);
      resetInactivityTimer();
    } catch (e) {
      if (e instanceof ApiError) {
        const code = (e as ApiError).code;
        if (code === "INVALID_PIN") {
          setPinError("Incorrect PIN. Try again.");
        } else {
          setPinError(e.message);
        }
      } else {
        setPinError("Failed to verify PIN. Please try again.");
      }
    }
  }, [resetInactivityTimer]);

  const lockSession = useCallback(async () => {
    // Best-effort: tell the server to clear pin_verified_at on all sessions and
    // push a WS event to other devices. Then lock locally regardless.
    try { await lockSessionApi(); } catch { /* ignore — local lock still applies */ }
    pinVerifiedAtRef.current = 0;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!isGuestAuthPath()) {
      setLockState("pin_required");
      setLockedAt(Date.now());
    }
  }, []);

  // Cancel registration at the PIN-creation step. ONLY valid in pin_setup state
  // (account never had a PIN — PENDING_PIN). Deletes the account, clears the
  // session, and sends the user back to the landing/login page. Once a PIN
  // exists (pin_required / ACTIVE) there is no cancel — only the PIN unlocks.
  const onPinCancel = useCallback(async () => {
    setPinError(null);
    if (lockStateRef.current !== "pin_setup") return;
    try {
      await cancelPinSetup();
    } finally {
      pinVerifiedAtRef.current = 0;
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      setLockState("active");
      setLockedAt(0);
      // Hard redirect to fully reset app state (we deleted the account).
      window.location.replace("/login");
    }
  }, []);

  // On mount: check JWT claims to determine if PIN setup/verify is needed
  useEffect(() => {
    if (isGuestAuthPath()) return;
    getPinStatus()
      .then(({ pin_status, pin_verified }) => {
        if (pin_status === "PENDING_PIN") {
          setLockState("pin_setup");
          setLockedAt(Date.now());
        } else if (pin_status === "ACTIVE" && !pin_verified) {
          setLockState("pin_required");
          setLockedAt(Date.now());
        } else {
          // ACTIVE + verified
          pinVerifiedAtRef.current = Date.now();
          resetInactivityTimer();
        }
      })
      .catch(() => {
        // Not authenticated yet — guest path handles it
      });
  }, [resetInactivityTimer]);

  // OAuth-registration exception: if the user is at the PIN-creation step
  // (pin_setup = PENDING_PIN, no PIN ever saved) and navigates AWAY via browser
  // back / cancel to a guest page, the whole registration is aborted and the
  // just-created account is deleted. This exception ONLY applies to pin_setup —
  // an ACTIVE account in pin_required state is strictly protected (no bypass).
  useEffect(() => {
    function onLocationChange() {
      if (lockStateRef.current === "pin_setup" && isGuestAuthPath(window.location.pathname)) {
        void onPinCancel();
      }
    }
    window.addEventListener("nexa:locationchange", onLocationChange as EventListener);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("nexa:locationchange", onLocationChange as EventListener);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, [onPinCancel]);

  // On navigation to a protected route: proactively re-check PIN status if we
  // haven't verified yet this session (e.g. right after OAuth callback or email
  // login, before any protected API call fires). This ensures the overlay appears
  // immediately on navigation rather than waiting for the first 403.
  useEffect(() => {
    function onNavigateToProtected() {
      if (
        !isGuestAuthPath(window.location.pathname) &&
        lockStateRef.current === "active" &&
        pinVerifiedAtRef.current === 0
      ) {
        getPinStatus()
          .then(({ pin_status, pin_verified }) => {
            if (pin_status === "PENDING_PIN") {
              setLockState("pin_setup");
              setLockedAt(Date.now());
            } else if (pin_status === "ACTIVE" && !pin_verified) {
              setLockState("pin_required");
              setLockedAt(Date.now());
            } else {
              pinVerifiedAtRef.current = Date.now();
              resetInactivityTimer();
            }
          })
          .catch(() => {});
      }
    }
    window.addEventListener("nexa:locationchange", onNavigateToProtected as EventListener);
    return () => window.removeEventListener("nexa:locationchange", onNavigateToProtected as EventListener);
  }, [resetInactivityTimer]);

  // 403 PIN error interceptor: react to API responses that signal PIN needed.
  // Guard against guest paths — a background request (e.g. stale fire-and-forget)
  // can race with navigation and must not trigger the overlay on login/register.
  useEffect(() => {
    function handlePinRequired(e: Event) {
      const detail = (e as CustomEvent<{ code: string }>).detail;
      if (isGuestAuthPath(window.location.pathname)) return;
      if (detail.code === "PIN_SETUP_REQUIRED") {
        // If PIN was already verified this session, ignore stale 403s from
        // in-flight requests that were sent before the new token arrived.
        if (pinVerifiedAtRef.current > 0) return;
        setLockState("pin_setup");
        setLockedAt(Date.now());
      } else if (detail.code === "PIN_REQUIRED") {
        setLockState("pin_required");
        setLockedAt(Date.now());
        pinVerifiedAtRef.current = 0;
      }
    }
    window.addEventListener("nexa:pin_blocked", handlePinRequired as EventListener);
    return () => window.removeEventListener("nexa:pin_blocked", handlePinRequired as EventListener);
  }, []);

  // Cross-device lock: another device locked the account (via manual lock or new login).
  // The WS frame "session.lock" is re-emitted as a DOM event by useRealtimeChat.
  useEffect(() => {
    function onSessionLock() {
      if (isGuestAuthPath(window.location.pathname)) return;
      pinVerifiedAtRef.current = 0;
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      setLockState("pin_required");
      setLockedAt(Date.now());
    }
    window.addEventListener("nexa:session_lock", onSessionLock);
    return () => window.removeEventListener("nexa:session_lock", onSessionLock);
  }, []);

  // User activity resets inactivity timer (but only if PIN is already verified)
  useEffect(() => {
    function onActivity() {
      if (pinVerifiedAtRef.current > 0 && lockStateRef.current === "active") {
        resetInactivityTimer();
      }
    }
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    return () => events.forEach(ev => window.removeEventListener(ev, onActivity));
  }, [resetInactivityTimer]);

  useEffect(() => {
    setScreenshotCb(() => lock("screenshot_blocked"));
    return () => setScreenshotCb(null);
  }, [lock]);

  return (
    <LockContext.Provider value={{ lockState, lockedAt, pinError, lock, unlock, onPinSetup, onPinVerify, onPinCancel, lockSession }}>
      {children}
    </LockContext.Provider>
  );
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used within LockProvider");
  return ctx;
}
