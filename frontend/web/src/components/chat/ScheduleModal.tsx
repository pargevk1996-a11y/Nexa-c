import { useEffect, useMemo, useState } from "react";
import {
  cancelScheduledMessage,
  createScheduledMessage,
  listScheduledMessages,
  type ScheduledMessage,
} from "@/api/chat";

interface ScheduleModalProps {
  conversationId: string;
  /** The message currently typed in the composer — this is what gets scheduled. */
  text: string;
  onClose: () => void;
  /** Called after a successful schedule so the composer draft can be cleared. */
  onScheduled?: () => void;
}

/** Local datetime string (YYYY-MM-DDTHH:mm) for an <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduleModal({ conversationId, text, onClose, onScheduled }: ScheduleModalProps) {
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(
    () => () => {
      listScheduledMessages(conversationId)
        .then(setItems)
        .catch(() => {});
    },
    [conversationId],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const schedule = async () => {
    setError(null);
    const body = text.trim();
    if (!body) {
      setError("Type a message first");
      return;
    }
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) {
      setError("Pick a valid time");
      return;
    }
    if (at.getTime() <= Date.now()) {
      setError("Time must be in the future");
      return;
    }
    setBusy(true);
    try {
      await createScheduledMessage(conversationId, { body, scheduled_at: at.toISOString() });
      onScheduled?.();
      refresh();
    } catch {
      setError("Could not schedule");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelScheduledMessage(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="schedule-modal__backdrop" onClick={onClose} role="presentation">
      <div
        className="schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Schedule message"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="schedule-modal__head">
          <h3>Send later</h3>
          <button type="button" className="schedule-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {text.trim() ? (
          <p className="schedule-modal__preview">{text.trim()}</p>
        ) : (
          <p className="schedule-modal__hint">Type a message in the chat, then pick a time.</p>
        )}

        <label className="schedule-modal__field">
          <span>Set date &amp; time</span>
          <input
            className="schedule-modal__when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Send at"
          />
        </label>

        {error ? <p className="schedule-modal__error">{error}</p> : null}

        <button type="button" className="schedule-modal__submit" onClick={schedule} disabled={busy}>
          {busy ? "Scheduling…" : "Schedule"}
        </button>

        {items.length > 0 ? (
          <div className="schedule-modal__list">
            <h4>Scheduled ({items.length})</h4>
            {items.map((i) => (
              <div key={i.id} className="schedule-modal__item">
                <div className="schedule-modal__item-body">
                  <span className="schedule-modal__item-text">{i.body}</span>
                  <span className="schedule-modal__item-when">{formatWhen(i.scheduled_at)}</span>
                </div>
                <button type="button" onClick={() => cancel(i.id)} aria-label="Cancel">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
