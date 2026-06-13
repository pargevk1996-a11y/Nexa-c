import { FormEvent, useEffect, useState } from "react";
import { getCachedSession } from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  hasSignatureForUser,
  storeSignatureForUser,
  validateSignatureFormat,
  verifySignatureForUser,
} from "@/security/signaturePin";

interface SignaturePinModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
}

export function SignaturePinModal({
  open,
  onClose,
  onSuccess,
  title = "Enter signature",
}: SignaturePinModalProps) {
  const session = getCachedSession();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setConfirm("");
      setError(null);
      return;
    }
    const uid = session?.user.id;
    if (!uid) {
      setSetupMode(true);
      return;
    }
    void hasSignatureForUser(uid).then((has) => setSetupMode(!has));
  }, [open, session?.user.id]);

  // Close on Escape — modal a11y parity (BUG-003, applied proactively).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!session?.user.id) {
      setError("Sign in required");
      return;
    }

    const formatErr = validateSignatureFormat(pin);
    if (formatErr) {
      setError(formatErr);
      return;
    }

    setLoading(true);
    try {
      if (setupMode) {
        if (pin !== confirm) {
          setError("Signatures do not match");
          return;
        }
        await storeSignatureForUser(session.user.id, pin);
        onSuccess();
        onClose();
        return;
      }

      const ok = await verifySignatureForUser(session.user.id, pin);
      if (!ok) {
        setError("Incorrect signature");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signature-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="signature-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="signature-modal-title">{setupMode ? "Create your signature" : title}</h3>
        <p className="signature-modal__hint">
          {setupMode
            ? "Choose a 4–6 digit signature. You will need it to allow screenshots and other sensitive actions."
            : "Enter the signature you set during registration to allow screenshots."}
        </p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <PasswordInput
            label="Signature"
            name="signature"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={loading}
          />
          {setupMode ? (
            <PasswordInput
              label="Confirm signature"
              name="signature_confirm"
              inputMode="numeric"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={loading}
            />
          ) : null}
          {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
          <div className="signature-modal__actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Confirm
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
