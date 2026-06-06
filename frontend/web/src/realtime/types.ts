export type WsFrameType = "event" | "ack" | "rpc" | "error";

export interface WsFrame {
  type: WsFrameType;
  id: string;
  name: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface PendingOutbound {
  clientMsgId: string;
  conversationId: string;
  body: string;
  attempts: number;
  createdAt: number;
  contentType?: string;
  silent?: boolean;
}

export type RealtimeConnectionState = "connected" | "reconnecting" | "offline" | "demo";
