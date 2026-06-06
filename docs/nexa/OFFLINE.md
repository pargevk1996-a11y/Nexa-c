# Nexa — Offline mode

> Read chats without network, send when back online, encrypted local cache, conflict-safe sync.

---

## Features

| Feature | Implementation |
|---------|----------------|
| **Offline chat access** | Encrypted IDB cache + `chatVault` (localStorage) |
| **Local encrypted cache** | `offline/encryptedCache.ts` → AES-GCM per user |
| **Sync after reconnect** | `runReconnectSync()` on WS connect + `online` event |
| **Queued messages** | `offlineQueue` (IDB) + WS flush + REST `flushOutboundQueueRest` |
| **Conflict resolution** | `mergeConversationMessages`, `replacePendingWithServer` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  UI (ChatContext / useRealtimeChat)                     │
├─────────────────────────────────────────────────────────┤
│  chatVault (secure localStorage) — demo + prefs        │
│  offline/chatOfflineCache — encrypted IDB timelines   │
│  realtime/offlineQueue — outbound pending sends         │
├─────────────────────────────────────────────────────────┤
│  offline/offlineSync — reconnect orchestration          │
│  offline/conflictResolution — merge rules               │
│  offline/queuedSend — REST flush                        │
└─────────────────────────────────────────────────────────┘
```

---

## Encrypted cache keys (IDB `kv` store)

| Key | Content |
|-----|---------|
| `enc:{userId}:offline:conversations` | Conversation list |
| `enc:{userId}:offline:messages:{convId}` | Message timeline |
| `enc:{userId}:offline:sync:meta` | `lastSyncAt`, `seqByConversation` |

Device key + user id → `deriveUserDataKey` (same as settings vault).

---

## Queued messages

1. User sends while WS down → `enqueueOutbound` + optimistic `pending-{clientMsgId}`.
2. On reconnect → WS `flushOfflineQueue` + `flushOutboundQueueRest`.
3. Server ack → `onPatchMessage` replaces pending row.

Max attempts: **5** per queued item.

---

## Conflict rules

1. **Server message** with same `id` replaces cached row.
2. **`pending-*`** kept until server message arrives or REST flush resolves.
3. **Timeline order** by `seq` when present, else `sentAt`.
4. **Conversation list** — remote fields overlay cached on sync.

---

## User-visible states

| State | UI |
|-------|-----|
| Offline | Status: «Offline — cached chats» |
| Reconnecting | «Reconnecting…» |
| Syncing | «Syncing…» + queue count |
| Queued | «N queued» on status bar |

---

## Verify

1. Live login → open chat → DevTools → **Offline** → chats still readable from cache.
2. Send message offline → appears as sending → go **Online** → delivers, pending cleared.
3. Two tabs: send offline in one, reconnect → no duplicate after merge.

See [REALTIME.md](./REALTIME.md) · [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md).
