import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconTimer } from "@/components/icons/Icons";
import type { Message } from "@/types";
import { EPHEMERAL_VIEW_MS, EPHEMERAL_VIEW_SECONDS } from "@/utils/ephemeral";

interface EphemeralWrapperProps {
  message: Message;
  isSecret?: boolean;
  onConsume: () => void;
  onBindViewStart?: (start: () => void) => void;
  children: ReactNode;
}

export function EphemeralWrapper({
  message,
  isSecret,
  onConsume,
  onBindViewStart,
  children,
}: EphemeralWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [exploding, setExploding] = useState(false);
  const startedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const endsAtRef = useRef(0);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearTimeout(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearTick();
    setExploding(true);
    window.setTimeout(onConsume, 650);
  }, [clearTick, onConsume]);

  const startViewTimer = useCallback(() => {
    if (message.outgoing || startedRef.current) return;
    startedRef.current = true;
    endsAtRef.current = Date.now() + EPHEMERAL_VIEW_MS;

    const tick = () => {
      const left = Math.max(0, endsAtRef.current - Date.now());
      setSecondsLeft(Math.ceil(left / 1000));
      if (left <= 0) {
        finish();
        return;
      }
      tickRef.current = window.setTimeout(tick, 200);
    };
    tick();
  }, [message.outgoing, finish]);

  useEffect(() => {
    onBindViewStart?.(startViewTimer);
  }, [onBindViewStart, startViewTimer]);

  useEffect(() => {
    if (!message.ephemeral || message.outgoing) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          startViewTimer();
        }
      },
      { threshold: [0.6] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [message.ephemeral, message.outgoing, message.id, startViewTimer]);

  useEffect(() => () => clearTick(), [clearTick]);

  return (
    <div
      ref={ref}
      className={`chat-ephemeral-wrap ${exploding ? "chat-ephemeral-wrap--boom" : ""} ${isSecret ? "chat-bubble--secret" : ""}`}
    >
      <span className="chat-bubble__ephemeral-tag" aria-hidden title="Disappearing message">
        <IconTimer size={14} />
      </span>
      {secondsLeft !== null && !message.outgoing && !exploding ? (
        <span className="chat-ephemeral-wrap__timer" role="status">
          Vanishes in {secondsLeft}s
        </span>
      ) : null}
      {children}
    </div>
  );
}

export { EPHEMERAL_VIEW_SECONDS };
