import { useCallback, useEffect, useRef } from "react";

/** Debounced typing indicator — emits start/stop to realtime transport. */
export function useTypingIndicator(
  conversationId: string | null,
  sendTyping: ((conversationId: string, isTyping: boolean) => void) | undefined,
  enabled = true,
) {
  const stopTimer = useRef<number | null>(null);
  const active = useRef(false);

  const stop = useCallback(() => {
    if (!conversationId || !sendTyping || !active.current) return;
    active.current = false;
    sendTyping(conversationId, false);
  }, [conversationId, sendTyping]);

  const pulse = useCallback(() => {
    if (!enabled || !conversationId || !sendTyping) return;
    if (!active.current) {
      active.current = true;
      sendTyping(conversationId, true);
    }
    if (stopTimer.current != null) window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(stop, 2200);
  }, [enabled, conversationId, sendTyping, stop]);

  useEffect(() => {
    return () => {
      if (stopTimer.current != null) window.clearTimeout(stopTimer.current);
      stop();
    };
  }, [conversationId, stop]);

  return { onInputActivity: pulse, stopTyping: stop };
}
