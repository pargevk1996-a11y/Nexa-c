# Realtime messaging architecture

## Overview

```
Client (React)
  ├─ REST → api-gateway → chat-service (persist, sync)
  └─ WSS  → ws-gateway (fan-out, typing, live events)
              ↕ Redis pub/sub (horizontal scale)
         chat-service / presence-service (publish)
```

## Components

| Component | Port (dev) | Role |
|-----------|------------|------|
| **ws-gateway** | 8009 | WebSocket connections, JWT auth, subscribe, `message.send`, heartbeat |
| **presence-service** | 8010 | Online state + typing in Redis, publishes `presence.*` / `typing.*` |
| **chat-service** | 8004 | Message store, `after_seq` sync, publishes `message.*` / `receipt.*` |
| **Redis** | 6379 | Connection registry, pub/sub channels, retry stream |

## WebSocket protocol

Endpoint: `ws://localhost:5173/api/v1/ws` (Vite proxy → ws-gateway)

1. Connect with `Sec-WebSocket-Protocol: bearer,<access_jwt>`
2. First frame: `{ "type":"event", "name":"auth", "payload":{ "token":"..." } }`
3. Subscribe: `{ "name":"subscribe", "payload":{ "conversation_ids":[] } }`
4. Send: `{ "name":"message.send", "payload":{ "conversation_id","client_msg_id","body" } }`

Server events: `message.new`, `message.edit`, `receipt.read`, `typing.start`, `presence.update`, `sync.required`

## Delivery guarantees

1. **Idempotency** — duplicate `client_msg_id` returns existing message (chat-store).
2. **At-least-once WS** — Redis stream `nexa:mq:retry` for offline users; ws-gateway retry worker.
3. **Ordering** — per-conversation monotonic `seq`; client sync via `GET /chat/conversations/{id}/sync?after_seq=N`.
4. **Offline** — client `offlineQueue` in localStorage + REST fallback on reconnect.

## Horizontal scaling

- Each ws-gateway instance has unique `WS_NODE_ID` (auto UUID).
- Registry: `nexa:ws:conn:{user_id}` → `{ node_id, conn_id }`.
- Fan-out: chat-service publishes to `nexa:ws:node:{node_id}` for each online member.

Run multiple ws-gateway processes behind a load balancer; Redis coordinates routing.

## Frontend

- `src/realtime/wsClient.ts` — reconnect (exponential backoff), heartbeat, offline queue flush, typing + read receipt frames.
- `src/realtime/sync.ts` — `after_seq` catch-up in localStorage.
- `src/realtime/useRealtimeChat.ts` — optimistic UI, WS events (`message.new`, `typing.*`, `receipt.*`, `sync.required` catch-up), mark read/delivered.
- `src/realtime/demoRealtime.ts` — simulates typing, receipts, presence, and push-style notifications in demo login.
- `src/realtime/notifications.ts` — browser notifications when the tab is hidden.
- `RealtimeStatusBar` — Live / Reconnecting / Offline / Demo indicator in the chat header area.
- Live mode: enabled with `accessToken` (not demo mode). Demo mode uses `demoRealtime` instead.
- `ChatContext` uses `liveChatEnabled` for WS transport (send, typing, receipts); `apiMessages` replace mock history once sync completes. `liveMode` flips on `connected` or first conversation list fetch.
- `ChatContext` exposes `markMessageDelivered` / `markMessagesRead`; `MessageList` marks incoming messages delivered when visible and read when scrolled to bottom.
- `RealtimeStatusBar` is shown only while reconnecting/offline (hidden when Live or Demo).

## Dev

```bash
make dev-up   # starts ws-gateway :8009, presence-service :8010
```

Create a conversation via API or UI after register/login; messages fan-out to subscribed clients.
