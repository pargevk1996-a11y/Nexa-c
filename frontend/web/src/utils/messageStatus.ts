import type { Message } from "@/types";

/** Peer has received or read the message — undo send is not allowed. */
export function isMessageViewedByPeer(status?: Message["status"]): boolean {
  return status === "read" || status === "delivered";
}

export function canRecallMessage(message: Message): boolean {
  return Boolean(message.outgoing && !message.recalled && !isMessageViewedByPeer(message.status));
}
