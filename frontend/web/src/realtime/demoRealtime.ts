/** Demo-mode realtime simulation (typing, receipts, presence) when WS is off. */

import type { Message } from "@/types";
import type { RealtimeConnectionState } from "./types";

export type { RealtimeConnectionState };

export interface DemoRealtimeCallbacks {
  onConnectionState: (state: RealtimeConnectionState) => void;
  onTyping: (conversationId: string, isTyping: boolean) => void;
  onPresence: (conversationId: string, online: boolean) => void;
  onMessageStatus: (messageId: string, status: NonNullable<Message["status"]>) => void;
  onIncomingMessage: (conversationId: string, message: Message) => void;
  onNotify: (conversationId: string, title: string, body: string, silent?: boolean) => void;
}

const TYPING_CONV = "c2";
const PRESENCE_CONV = "c1";

export function startDemoRealtime(callbacks: DemoRealtimeCallbacks): () => void {
  callbacks.onConnectionState("demo");

  const typingTimer = window.setInterval(() => {
    callbacks.onTyping(TYPING_CONV, true);
    window.setTimeout(() => callbacks.onTyping(TYPING_CONV, false), 2800);
  }, 12_000);

  const presenceTimer = window.setInterval(() => {
    callbacks.onPresence(PRESENCE_CONV, Math.random() > 0.35);
  }, 25_000);

  const incomingTimer = window.setInterval(() => {
    const convId = Math.random() > 0.5 ? "c1" : "c3";
    const id = `demo-in-${Date.now()}`;
    const msg: Message = {
      id,
      conversationId: convId,
      kind: "text",
      text: convId === "c3" ? "Quick sync on the deploy?" : "Got it — thanks!",
      sentAt: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      outgoing: false,
      status: "delivered",
    };
    callbacks.onIncomingMessage(convId, msg);
    callbacks.onNotify(convId, convId === "c3" ? "Dev Team" : "Alex", msg.text);
  }, 45_000);

  return () => {
    window.clearInterval(typingTimer);
    window.clearInterval(presenceTimer);
    window.clearInterval(incomingTimer);
    callbacks.onConnectionState("offline");
  };
}

/** Progress optimistic outgoing message through sent → delivered → read. */
export function scheduleDemoReceipts(
  messageId: string,
  onStatus: (id: string, status: NonNullable<Message["status"]>) => void,
): void {
  window.setTimeout(() => onStatus(messageId, "sent"), 280);
  window.setTimeout(() => onStatus(messageId, "delivered"), 900);
  window.setTimeout(() => onStatus(messageId, "read"), 2400);
}
