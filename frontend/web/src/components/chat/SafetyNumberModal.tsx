import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCachedSession } from "@/api/auth";
import { fetchPeerPublicKey } from "@/api/e2ee";
import { getMyPublicKeyB64 } from "@/security/e2ee";
import { computeSafetyNumber, formatSafetyNumberRows } from "@/security/safetyNumbers";

const LS_KEY = (userId: string) => `nexa-safety-verified-${userId}`;

interface Props {
  peerUserId: string;
  peerName: string;
  onClose: () => void;
}

type Status = "loading" | "ready" | "no_keys" | "error";

export function SafetyNumberModal({ peerUserId, peerName, onClose }: Props) {
  const [status, setStatus]           = useState<Status>("loading");
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [verified, setVerified]       = useState(() => Boolean(localStorage.getItem(LS_KEY(peerUserId))));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const session = getCachedSession();
        if (!session) { setStatus("error"); return; }
        const myKey = getMyPublicKeyB64();
        const peerKey = await fetchPeerPublicKey(peerUserId);
        if (cancelled) return;
        if (!myKey || !peerKey) { setStatus("no_keys"); return; }
        const sn = await computeSafetyNumber(session.user.id, myKey, peerUserId, peerKey);
        if (cancelled) return;
        setSafetyNumber(sn);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [peerUserId]);

  function markVerified() {
    localStorage.setItem(LS_KEY(peerUserId), "1");
    setVerified(true);
  }

  function markUnverified() {
    localStorage.removeItem(LS_KEY(peerUserId));
    setVerified(false);
  }

  const [row1, row2] = safetyNumber ? formatSafetyNumberRows(safetyNumber) : ["", ""];

  return createPortal(
    <div
      className="sn-modal__backdrop"
      role="dialog"
      aria-modal
      aria-label="Verify Safety Numbers"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sn-modal">
        <div className="sn-modal__head">
          <h3 className="sn-modal__title">Safety Numbers</h3>
          <button type="button" className="sn-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="sn-modal__subtitle">Conversation with <strong>{peerName}</strong></p>

        {status === "loading" && (
          <p className="sn-modal__status">Computing fingerprint…</p>
        )}

        {status === "no_keys" && (
          <div className="sn-modal__warning">
            <p>Safety numbers are not available yet.</p>
            <p>Both users must send at least one message so encryption keys are exchanged.</p>
          </div>
        )}

        {status === "error" && (
          <p className="sn-modal__status sn-modal__status--error">Could not compute safety numbers. Try again later.</p>
        )}

        {status === "ready" && safetyNumber && (
          <>
            <div className={`sn-modal__code ${verified ? "sn-modal__code--verified" : ""}`}>
              <span className="sn-modal__row">{row1}</span>
              <span className="sn-modal__row">{row2}</span>
            </div>

            {verified ? (
              <div className="sn-modal__verified-badge">
                Verified
              </div>
            ) : null}

            <p className="sn-modal__hint">
              Compare this number with <strong>{peerName}</strong> via a different channel (phone call,
              in person, or another app). If the numbers match, your conversation is secure.
            </p>

            {verified ? (
              <button type="button" className="sn-modal__btn sn-modal__btn--secondary" onClick={markUnverified}>
                Mark as unverified
              </button>
            ) : (
              <button type="button" className="sn-modal__btn" onClick={markVerified}>
                Mark as verified
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
