import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLock, type LockState } from "@/store/LockContext";
import { isGuestAuthPath } from "@/security/authRoutes";

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
}: {
  mode: "setup" | "verify";
  error: string | null;
  onSubmit: (pin: string) => Promise<void>;
  onCancel?: () => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const busy = loading || cancelling;

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

export function LockOverlay() {
  const { lockState, unlock, pinError, onPinSetup, onPinVerify, onPinCancel } = useLock();
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
