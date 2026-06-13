import { useCallback, useEffect, useState } from "react";
import {
  getChatNotificationPrefs,
  getGlobalNotificationPrefs,
  putChatNotificationPrefs,
  putGlobalNotificationPrefs,
} from "@/api/notifications";
import { setChatMutedLocal, setChatNotificationPrefs, setGlobalNotificationPrefs } from "@/notifications/NotificationCenter";
import type { NotificationPreferences } from "@/notifications/types";
import { useSession } from "./useSession";

export function useNotificationPrefs(conversationId?: string | null) {
  const session = useSession();
  const [globalPrefs, setGlobalPrefs] = useState<NotificationPreferences | null>(null);
  const [chatPrefs, setChatPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);

  const live = Boolean(session?.user?.id && !session?.demoMode);

  const refresh = useCallback(async () => {
    if (!live) return;
    setLoading(true);
    try {
      const g = await getGlobalNotificationPrefs();
      setGlobalPrefs(g);
      setGlobalNotificationPrefs(g);
      if (conversationId) {
        const c = await getChatNotificationPrefs(conversationId);
        setChatPrefs(c);
        setChatNotificationPrefs(conversationId, c);
        setChatMutedLocal(conversationId, c.mute_all);
      }
    } catch {
      /* demo / offline */
    } finally {
      setLoading(false);
    }
  }, [live, conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateGlobal = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      if (!live) return;
      const next = await putGlobalNotificationPrefs(patch);
      setGlobalPrefs(next);
      setGlobalNotificationPrefs(next);
    },
    [live],
  );

  const updateChat = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      if (!live || !conversationId) return;
      const next = await putChatNotificationPrefs(conversationId, patch);
      setChatPrefs(next);
      setChatNotificationPrefs(conversationId, next);
      setChatMutedLocal(conversationId, next.mute_all);
    },
    [live, conversationId],
  );

  return {
    globalPrefs,
    chatPrefs,
    loading,
    live,
    refresh,
    updateGlobal,
    updateChat,
  };
}
