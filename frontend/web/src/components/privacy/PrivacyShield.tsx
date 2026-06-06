import { useState } from "react";
import { createPortal } from "react-dom";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { explicitUnlock, getLockStartedAt } from "@/security/privacySeal";
import { SignaturePinModal } from "@/components/settings/SignaturePinModal";

const PIN_REQUIRED_AFTER_MS = 60_000;

export function PrivacyShield() {
  const [showPin, setShowPin] = useState(false);

  function handleClick() {
    if (showPin) return;
    const elapsed = getLockStartedAt() > 0 ? Date.now() - getLockStartedAt() : 0;
    if (elapsed >= PIN_REQUIRED_AFTER_MS) {
      setShowPin(true);
    } else {
      explicitUnlock();
    }
  }

  function handlePinSuccess() {
    setShowPin(false);
    explicitUnlock();
  }

  function handlePinClose() {
    setShowPin(false);
  }

  return createPortal(
    <>
      <div
        className={`privacy-shield ${showPin ? "" : "privacy-shield--clickable"}`}
        role="button"
        tabIndex={showPin ? undefined : 0}
        onClick={handleClick}
        onKeyDown={(e) => { if (!showPin && (e.key === "Enter" || e.key === " ")) handleClick(); }}
        aria-label="Click to unlock"
        aria-hidden={showPin}
      >
        <div className="privacy-shield__inner">
          <LogoAnimation size={192} />
          <p className="privacy-shield__title">We always think about your security</p>
          <p className="privacy-shield__text">To unlock, click on the chat area</p>
        </div>
      </div>
      <SignaturePinModal
        open={showPin}
        title="Enter PIN to unlock"
        onClose={handlePinClose}
        onSuccess={handlePinSuccess}
      />
    </>,
    document.body,
  );
}
