import { useCallback, useEffect, useRef, useState } from "react";
import { suggestReplies, type ContextMessage } from "@/api/ai";
import { features } from "@/features/registry";

export function useSmartReply(
  conversationId: string | null,
  recentMessages: ContextMessage[],
  enabled: boolean,
) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!features.ai || !enabled || !conversationId || recentMessages.length === 0) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await suggestReplies({
        conversation_id: conversationId,
        recent_messages: recentMessages.slice(-8),
      });
      setSuggestions(res.suggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId, enabled, recentMessages]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void refresh();
    }, 600);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [refresh]);

  return { suggestions, loading, refresh, clear: () => setSuggestions([]) };
}
