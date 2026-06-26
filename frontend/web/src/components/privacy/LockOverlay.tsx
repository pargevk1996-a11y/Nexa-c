import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLock, type LockState } from "@/store/LockContext";
import { isGuestAuthPath } from "@/security/authRoutes";
import { biometricLabel, isBiometricUnlockSupported } from "@/config/features";
import { isBiometricEnabledLocally } from "@/security/biometric";

const CLICK_CONTENT: Record<"screenshot_blocked" | "away", { title: string; body: string }> = {
  screenshot_blocked: {
    title: "Oops! Screenshots are not allowed.",
    body: "To unlock, please click on the screen.",
  },
  away: {
    title: "We always think about your security",
    body: "To continue, click anywhere on the screen.",
  },
};

function PinForm({
  mode,
  error,
  onSubmit,
  onCancel,
  onBiometric,
}: {
  mode: "setup" | "verify";
  error: string | null;
  onSubmit: (pin: string) => Promise<void>;
  onCancel?: () => Promise<void>;
  onBiometric?: () => Promise<boolean>;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show the biometric shortcut only on a mobile device that has opted in.
  const showBiometric =
    mode === "verify" && !!onBiometric && isBiometricUnlockSupported() && isBiometricEnabledLocally();

  async function handleBiometric() {
    if (!onBiometric) return;
    setLocalError(null);
    setBioBusy(true);
    const ok = await onBiometric();
    setBioBusy(false);
    if (!ok) setLocalError("Biometric unlock failed. Enter your PIN.");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!/^\d{1,6}$/.test(pin)) { setLocalError("PIN must be 1–6 digits"); return; }

    setLoading(true);
    await onSubmit(pin);
    setLoading(false);
    setPin("");
  }

  async function handleCancel() {
    if (!onCancel) return;
    setCancelling(true);
    await onCancel();
    // onCancel navigates away; no need to reset state.
  }

  const displayError = localError || error;
  const busy = loading || cancelling || bioBusy;

  return (
    <form className="lock-overlay__pin-form" onSubmit={handleSubmit}>
      <h2 className="lock-overlay__title">
        {mode === "setup" ? "Create your PIN" : "Enter your PIN"}
      </h2>
      <p className="lock-overlay__body">
        {mode === "setup"
          ? "Choose a PIN to protect your account. You'll need it every time you open the app."
          : "Enter your PIN to continue."}
      </p>

      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        className="lock-overlay__pin-input"
        placeholder={mode === "setup" ? "Create PIN (1–6 digits)" : "Enter PIN"}
        value={pin}
        maxLength={6}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        autoComplete="new-password"
        autoFocus
        disabled={busy}
      />

      {displayError && (
        <p className="lock-overlay__pin-error">{displayError}</p>
      )}

      <button
        type="submit"
        className="lock-overlay__pin-btn"
        disabled={busy || pin.length === 0}
      >
        {loading ? "…" : mode === "setup" ? "Set PIN" : "Unlock"}
      </button>

      {showBiometric && (
        <button
          type="button"
          className="lock-overlay__pin-biometric"
          onClick={() => void handleBiometric()}
          disabled={busy}
        >
          {bioBusy ? "Waiting for biometrics…" : `Unlock with ${biometricLabel()}`}
        </button>
      )}

      {mode === "setup" && onCancel && (
        <button
          type="button"
          className="lock-overlay__pin-cancel"
          onClick={() => void handleCancel()}
          disabled={busy}
        >
          {cancelling ? "Cancelling…" : "Cancel and discard account"}
        </button>
      )}
    </form>
  );
}

function BiometricOffer({
  busy,
  onAccept,
  onDecline,
}: {
  busy: boolean;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}) {
  const label = biometricLabel();
  return (
    <div className="lock-overlay lock-overlay--pin">
      <div className="lock-overlay__inner">
        <div className="lock-overlay__pin-form">
          <h2 className="lock-overlay__title">Enable {label}?</h2>
          <p className="lock-overlay__body">
            Unlock Nexa with {label} instead of typing your PIN every time. Your
            biometrics stay on this device — Nexa never sees them.
          </p>
          <button
            type="button"
            className="lock-overlay__pin-btn"
            onClick={() => void onAccept()}
            disabled={busy}
          >
            {busy ? "Setting up…" : `Enable ${label}`}
          </button>
          <button
            type="button"
            className="lock-overlay__pin-cancel"
            onClick={onDecline}
            disabled={busy}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function LockOverlay() {
  const {
    lockState,
    unlock,
    pinError,
    onPinSetup,
    onPinVerify,
    onPinCancel,
    offerBiometric,
    biometricBusy,
    acceptBiometricOffer,
    declineBiometricOffer,
    onBiometricUnlock,
  } = useLock();
  // This component renders OUTSIDE <Router>, so we can't use useLocation().
  // Track the path via the bridged "nexa:locationchange" event + popstate.
  const [pathname, setPathname] = useState<string>(window.location.pathname);

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("nexa:locationchange", sync as EventListener);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("nexa:locationchange", sync as EventListener);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // PIN overlay must never cover guest pages (login, register, oauth, etc.)
  if (isGuestAuthPath(pathname)) return null;

  // One-time opt-in offer shown right after PIN setup (mobile only). Renders on
  // top even once the app is unlocked so data can load behind it.
  if (offerBiometric) {
    return createPortal(
      <BiometricOffer
        busy={biometricBusy}
        onAccept={acceptBiometricOffer}
        onDecline={declineBiometricOffer}
      />,
      document.body,
    );
  }

  if (lockState === "active") return null;

  if (lockState === "pin_setup" || lockState === "pin_required") {
    return createPortal(
      <div className="lock-overlay lock-overlay--pin">
        <div className="lock-overlay__inner">
          <PinForm
            mode={lockState === "pin_setup" ? "setup" : "verify"}
            error={pinError}
            onSubmit={lockState === "pin_setup" ? onPinSetup : onPinVerify}
            onCancel={lockState === "pin_setup" ? onPinCancel : undefined}
            onBiometric={lockState === "pin_required" ? onBiometricUnlock : undefined}
          />
        </div>
      </div>,
      document.body,
    );
  }

  const { title, body } = CLICK_CONTENT[lockState as "screenshot_blocked" | "away"];

  return createPortal(
    <div
      className="lock-overlay lock-overlay--clickable"
      role="button"
      tabIndex={0}
      onClick={unlock}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") unlock(); }}
      aria-label="Click to unlock"
    >
      <div className="lock-overlay__inner" onClick={(e) => e.stopPropagation()}>
        <p className="lock-overlay__title">{title}</p>
        <p className="lock-overlay__body">{body}</p>
      </div>
    </div>,
    document.body,
  );
}
