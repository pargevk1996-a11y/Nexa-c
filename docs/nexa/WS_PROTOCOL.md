# Nexa — WebSocket Protocol v1

> Frame schema: `backend/shared/securechat_shared/realtime/events.py`  
> Handler: `backend/ws-gateway/app/ws/handler.py`

---

## Connection

```
URL:     wss://host/api/v1/ws
         (dev: ws://127.0.0.1:8009/api/v1/ws or Vite proxy)
Subproto: bearer,<access_jwt>  (optional; auth frame required either way)
```

### Lifecycle

1. Connect TCP + WS upgrade
2. Send `auth` event within 10s
3. Receive `auth.ok` or `error`
4. `subscribe` to conversation IDs
5. Exchange events; send `ping` every 25s → `pong`

### Reconnect

- Exponential backoff: 1s → 2s → 4s → … max 30s
- On reconnect: re-auth, re-subscribe, flush offline queue, `sync?after_seq=`

---

## Frame format

```typescript
interface WsFrame {
  type: "event" | "ack" | "rpc" | "error";
  id: string;          // UUID, client-generated for RPC
  name: string;        // event name
  payload: Record<string, unknown>;
  ts: number;          // unix ms
}
```

---

## Client → Server events

| Name | Payload | Response | Status |
|------|---------|----------|--------|
| `auth` | `{ token: string }` | `auth.ok` | ✅ |
| `ping` | `{}` | `pong` | ✅ |
| `subscribe` | `{ conversation_ids: string[] }` | `subscribe.ok` | ✅ |
| `unsubscribe` | `{ conversation_ids: string[] }` | `subscribe.ok` | ✅ |
| `message.send` | `{ conversation_id, client_msg_id, body, content_type?, reply_to_id?, thread_root_id?, media_id? }` | `message.send.ok` / `message.send.failed` | ✅ |
| `typing` | `{ conversation_id, is_typing: boolean }` | `typing.ok` | ✅ |
| `presence.heartbeat` | `{}` | `presence.ok` | ✅ |
| `call.signal` | `{ call_id, to_user_id, signal_type, sdp?, candidate? }` | `call.signal.ok` | ✅ |
| `message.edit` | `{ conversation_id, message_id, body }` | `message.edit.ok` | ⬜ |
| `message.delete` | `{ conversation_id, message_id, scope }` | `message.delete.ok` | ⬜ |
| `reaction.toggle` | `{ conversation_id, message_id, emoji }` | `reaction.ok` | ⬜ |
| `read.up_to` | `{ conversation_id, up_to_seq }` | `read.ok` | ⬜ (REST used today) |

---

## Server → Client events

### Messages

| Name | Payload | Source | Status |
|------|---------|--------|--------|
| `message.new` | `{ message: MessageDTO }` | chat-service | ✅ |
| `message.edit` | `{ message: MessageDTO }` | chat-service | ✅ |
| `message.delete` | `{ conversation_id, message_id, scope, deleted_at }` | chat-service | ⬜ |
| `sync.required` | `{ conversation_id, reason }` | chat-service | ⬜ |

### Receipts

| Name | Payload | Status |
|------|---------|--------|
| `receipt.delivered` | `{ conversation_id, message_id, user_id, delivered_at }` | ⬜ |
| `receipt.read` | `{ conversation_id, user_id, up_to_seq, read_at }` | ✅ |

### Presence & typing

| Name | Payload | Status |
|------|---------|--------|
| `presence.update` | `{ user_id, status: online\|offline, last_seen? }` | ✅ |
| `typing.start` | `{ conversation_id, user_id }` | ✅ |
| `typing.stop` | `{ conversation_id, user_id }` | ✅ |

### Conversations & members

| Name | Payload | Status |
|------|---------|--------|
| `conversation.updated` | `{ conversation: ConversationDTO }` | ⬜ |
| `member.joined` | `{ conversation_id, user_id, role }` | ⬜ |
| `member.left` | `{ conversation_id, user_id }` | ⬜ |
| `member.role_changed` | `{ conversation_id, user_id, role }` | ⬜ |

### Calls

| Name | Payload | Status |
|------|---------|--------|
| `call.incoming` | `{ call_id, call_type, caller_id, participant_ids, is_group }` | ✅ |
| `call.accepted` | `{ call_id, user_id }` | ✅ |
| `call.rejected` | `{ call_id, user_id }` | ✅ |
| `call.ended` | `{ call_id, user_id }` | ✅ |
| `call.signal` | `{ call_id, from_user_id, signal_type, sdp?, candidate? }` | ✅ |

### Notifications

| Name | Payload | Status |
|------|---------|--------|
| `notification.push` | `{ id, title, body, conversation_id, silent }` | ⬜ |

### System

| Name | Payload | Status |
|------|---------|--------|
| `retry` | `{ original_frame }` | ✅ internal |
| `error` | `{ code, message }` | ✅ |

---

## Ack / error codes

| Code | Meaning |
|------|---------|
| `AUTH_REQUIRED` | No token |
| `AUTH_INVALID` | Bad/expired JWT |
| `AUTH_OK` | Authenticated |
| `NOT_SUBSCRIBED` | Send to unsubscribed conversation |
| `RATE_LIMITED` | Too many frames |
| `UNKNOWN_EVENT` | Unrecognized name |
| `VALIDATION_ERROR` | Bad payload |

---

## Internal bus (Redis)

```python
@dataclass
class RealtimeEvent:
    name: str
    target_user_ids: list[str]
    payload: dict
    conversation_id: str | None
    source_node_id: str | None
```

**Channels:**

- `nexa:ws:broadcast` — all nodes
- `nexa:ws:node:{node_id}` — specific ws-gateway instance
- `nexa:mq:retry` — offline delivery retry stream

**Registry keys:**

- `nexa:ws:conn:{user_id}` → `{ node_id, conn_id, last_seen }`
- `nexa:presence:{user_id}` → TTL online flag
- `nexa:typing:{conversation_id}` → set of user_ids

---

## MessageDTO (server → client)

```typescript
interface MessageDTO {
  id: string;
  conversation_id: string;
  sender_id: string;
  seq: number;
  body: string;
  content_type: "text" | "voice" | "file" | "video" | "sticker";
  reply_to_id?: string;
  forward_from_id?: string;
  thread_root_id?: string;
  media_id?: string;
  reactions: Record<string, string[]>;
  created_at: string;
  edited_at?: string;
  expires_at?: string;
}
```

---

## Client implementation

| Module | Role |
|--------|------|
| `realtime/wsClient.ts` | Connect, auth, heartbeat, reconnect |
| `realtime/offlineQueue.ts` | Persist pending sends |
| `realtime/sync.ts` | `after_seq` catch-up |
| `realtime/useRealtimeChat.ts` | React integration + optimistic UI |

---

See [REALTIME.md](./REALTIME.md) for ops and scaling.
