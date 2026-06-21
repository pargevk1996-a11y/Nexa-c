import { getCachedSession } from "@/security/sessionCache";
import type { RealtimeConnectionState, WsFrame } from "./types";
import { flushOutboundQueueRest } from "@/offline/queuedSend";
import { bumpAttempt, enqueueOutbound, loadOfflineQueue, removeOutbound } from "./offlineQueue";
import type { PendingOutbound } from "./types";

export type WsEventHandler = (frame: WsFrame) => void;

export interface WsClientOptions {
  onEvent: WsEventHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionState?: (state: RealtimeConnectionState) => void;
  getAccessToken?: () => string | undefined;
}

function wsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/ws`;
}

function newClientMsgId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export class RealtimeWsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private heartbeatTimer: number | null = null;
  private closed = false;
  private subscribed = new Set<string>();
  private readonly opts: WsClientOptions;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closed = false;
    // Gate on a live session so we don't open sockets for unauthenticated users.
    // The actual credential is the httpOnly access_token cookie — the browser
    // sends it automatically on the WebSocket upgrade, so no token needs to
    // appear in JS memory, request headers, or the Sec-WebSocket-Protocol field.
    if (!getCachedSession()) return;

    const url = wsUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.opts.onConnectionState?.("connected");
      // Auth frame: the server reads the token from the httpOnly cookie that
      // the browser already attached to the upgrade request. No token in payload.
      this.send({
        type: "event",
        id: crypto.randomUUID(),
        name: "auth",
        payload: {},
        ts: Date.now(),
      });
      this.startHeartbeat();
      this.resubscribe();
      void this.flushOfflineQueue();
      this.opts.onConnected?.();
    };

    this.ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as WsFrame;
        if (frame.type === "ack" && frame.name === "auth.ok") {
          this.resubscribe();
          void this.flushOfflineQueue();
        }
        if (frame.type === "ack" && frame.name === "message.send.ok") {
          const cid = frame.payload.client_msg_id as string | undefined;
          if (cid) removeOutbound(cid);
        }
        if (frame.type === "error" && frame.name === "message.send.failed") {
          const cid = frame.payload.client_msg_id as string | undefined;
          if (cid) bumpAttempt(cid);
        }
        this.opts.onEvent(frame);
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.opts.onDisconnected?.();
      if (!this.closed) {
        this.opts.onConnectionState?.("reconnecting");
        this.scheduleReconnect();
      } else {
        this.opts.onConnectionState?.("offline");
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.opts.onConnectionState?.("offline");
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(conversationIds: string[]): void {
    for (const id of conversationIds) this.subscribed.add(id);
    if (this.ws?.readyState === WebSocket.OPEN && conversationIds.length) {
      this.send({
        type: "event",
        id: crypto.randomUUID(),
        name: "subscribe",
        payload: { conversation_ids: conversationIds },
        ts: Date.now(),
      });
    }
  }

  sendMessage(
    conversationId: string,
    body: string,
    existingClientMsgId?: string,
    replyToId?: string,
    e2eeEnvelope?: Record<string, unknown>,
  ): string {
    const clientMsgId = existingClientMsgId ?? newClientMsgId();
    const pending: PendingOutbound = {
      clientMsgId,
      conversationId,
      body,
      attempts: 0,
      createdAt: Date.now(),
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload: Record<string, unknown> = { conversation_id: conversationId, client_msg_id: clientMsgId, body };
      if (replyToId) payload.reply_to_id = replyToId;
      if (e2eeEnvelope) payload.e2ee_envelope = e2eeEnvelope;
      this.send({
        type: "event",
        id: clientMsgId,
        name: "message.send",
        payload,
        ts: Date.now(),
      });
    } else {
      enqueueOutbound(pending);
    }
    return clientMsgId;
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({
      type: "event",
      id: crypto.randomUUID(),
      name: "typing",
      payload: { conversation_id: conversationId, is_typing: isTyping },
      ts: Date.now(),
    });
  }

  sendReadReceipt(conversationId: string, upToSeq: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({
      type: "event",
      id: crypto.randomUUID(),
      name: "receipt.read",
      payload: { conversation_id: conversationId, up_to_seq: upToSeq },
      ts: Date.now(),
    });
  }

  private send(frame: WsFrame): void {
    this.ws?.send(JSON.stringify(frame));
  }

  private resubscribe(): void {
    if (this.subscribed.size) {
      this.subscribe([...this.subscribed]);
    }
  }

  private async flushOfflineQueue(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const item of loadOfflineQueue()) {
        if (item.attempts > 5) continue;
        this.send({
          type: "event",
          id: item.clientMsgId,
          name: "message.send",
          payload: {
            conversation_id: item.conversationId,
            client_msg_id: item.clientMsgId,
            body: item.body,
          },
          ts: Date.now(),
        });
      }
    }
    await flushOutboundQueueRest();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({
          type: "event",
          id: crypto.randomUUID(),
          name: "ping",
          payload: {},
          ts: Date.now(),
        });
        this.send({
          type: "event",
          id: crypto.randomUUID(),
          name: "presence.heartbeat",
          payload: { is_online: true },
          ts: Date.now(),
        });
      }
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    window.setTimeout(() => this.connect(), delay);
  }
}
