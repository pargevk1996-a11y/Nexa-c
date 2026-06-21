import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCachedSession } from "@/api/auth";
import {
  hasStoredSignature,
  storeSignatureForUser,
  validateSignatureFormat,
  verifySignatureForUser,
} from "@/security/signaturePin";
import { useLock, type LockState } from "@/store/LockContext";

interface StateContent {
  title: string;
  body: string;
  clickable: boolean;
}

const STATE_CONTENT: Record<Exclude<LockState, "active">, StateContent> = {
  pin_required: {
    title: "Screen locked",
    body: "Enter your PIN to unlock.",
    clickable: false,
  },
  screenshot_blocked: {
    title: "Oops! Screenshots are not allowed.",
    body: "To unlock, please click on the screen.",
    clickable: true,
  },
  away: {
    title: "We always think about your security",
    body: "To continue, click anywhere on the screen.",
    clickable: true,
  },
};

function PinForm({ onSuccess }: { onSuccess: () => void }) {
  // The session may still be hydrating when a restored lock paints on reload.
  // Track it reactively (via the persistSession event) so the PIN form becomes
  // usable the moment the session is available — never a permanent lockout.
  const [session, setSession] = useState(getCachedSession);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // true = no PIN stored yet → setup mode; false = verify mode
  const [setupMode, setSetupMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Random id each mount so browser can't correlate with saved credentials
  const uid = useId();

  // Pick up the session as soon as bootstrap finishes hydrating it.
  useEffect(() => {
    const onSession = () => setSession(getCachedSession());
    window.addEventListener("securechat-session", onSession);
    return () => window.removeEventListener("securechat-session", onSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    // Setup mode ONLY when no PIN blob exists on this device. Using a decryption
    // check here would let a transient decrypt failure (device key not warm yet)
    // present setup mode and accept+overwrite the PIN on the first try. Blob
    // presence is decryption-independent, so an existing PIN always means verify.
    setSetupMode(!hasStoredSignature(session.user.id));
    // Don't auto-focus on touch devices — that pops the on-screen keyboard before
    // the user taps the field. Focus only with a fine pointer (desktop).
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!session || submitting) return;
    const err = validateSignatureFormat(pin);
    if (err) { setError(err); return; }
    setSubmitting(true);
    try {
      if (setupMode) {
        await storeSignatureForUser(session.user.id, pin);
        onSuccess();
      } else {
        const ok = await verifySignatureForUser(session.user.id, pin);
        if (ok) {
          onSuccess();
        } else {
          setError("Incorrect PIN. Try again.");
          setPin("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // No <form> element — prevents browser from triggering "Save password?" dialog.
  // type="text" + CSS masking instead of type="password" avoids the password-manager
  // heuristic entirely. autoComplete="off" + data-lpignore cover extension managers.
  return (
    <div
      className="lock-overlay__pin-form"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        id={uid}
        className="lock-overlay__pin-input lock-overlay__pin-input--masked"
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder={setupMode ? "Create a 4–6 digit PIN" : "Enter PIN"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        aria-label="PIN code"
      />
      {error && <p className="lock-overlay__pin-error">{error}</p>}
      <button
        type="button"
        className="btn btn--primary lock-overlay__pin-btn"
        disabled={submitting || pin.length < 4}
        onClick={() => void submit()}
      >
        {submitting ? "Verifying…" : setupMode ? "Set PIN & Unlock" : "Unlock"}
      </button>
    </div>
  );
}

export function LockOverlay() {
  const { lockState, unlock } = useLock();

  if (lockState === "active") return null;

  const { clickable } = STATE_CONTENT[lockState];
  const isPinRequired = lockState === "pin_required";

  function handleOverlayClick() {
    if (!clickable) return;
    unlock();
  }

  return createPortal(
    <div
      className={`lock-overlay${clickable ? " lock-overlay--clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleOverlayClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") handleOverlayClick(); } : undefined}
      aria-label={clickable ? "Click to unlock" : undefined}
    >
      {isPinRequired && (
        <div
          className="lock-overlay__inner"
          onClick={(e) => e.stopPropagation()}
        >
          <PinForm onSuccess={unlock} />
        </div>
      )}
    </div>,
    document.body,
  );
}
