import { sendMessageRest } from "@/api/chat";
import { apiMessageToUi } from "@/realtime/mapMessage";
import { bumpAttempt, enqueueOutbound, loadOfflineQueue, removeOutbound } from "@/realtime/offlineQueue";
import type { PendingOutbound } from "@/realtime/types";
import { getCachedSession } from "@/security/sessionCache";
import { replacePendingWithServer } from "./conflictResolution";
import type { Message } from "@/types";

const MAX_ATTEMPTS = 5;

export type FlushResult = {
  sent: number;
  failed: number;
  resolved: Array<{ conversationId: string; clientMsgId: string; message: Message }>;
};

export async function flushOutboundQueueRest(): Promise<FlushResult> {
  const session = getCachedSession();
  if (!session?.accessToken || session.demoMode) {
    return { sent: 0, failed: 0, resolved: [] };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { sent: 0, failed: 0, resolved: [] };
  }

  const queue = loadOfflineQueue();
  let sent = 0;
  let failed = 0;
  const resolved: FlushResult["resolved"] = [];

  for (const item of queue) {
    if (item.attempts >= MAX_ATTEMPTS) {
      failed += 1;
      continue;
    }
    try {
      const apiMsg = await sendMessageRest(item.conversationId, {
        client_msg_id: item.clientMsgId,
        body: item.body,
        content_type: item.contentType ?? "text",
      });
      removeOutbound(item.clientMsgId);
      sent += 1;
      resolved.push({
        conversationId: item.conversationId,
        clientMsgId: item.clientMsgId,
        message: apiMessageToUi(apiMsg, session.user.id),
      });
    } catch {
      bumpAttempt(item.clientMsgId);
      failed += 1;
    }
  }

  return { sent, failed, resolved };
}

export function enqueueOutboundMessage(item: PendingOutbound): void {
  enqueueOutbound(item);
}
