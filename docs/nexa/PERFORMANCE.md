# Nexa — Performance & scale

Target: **millions of users**, high concurrent WebSockets, low-latency delivery, distributed failover.

> Current dev stores are mostly **in-memory**; production path is **Postgres + Redis Cluster + horizontal pods** (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

---

## Requirement map

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Millions of users | 🟡 Planned | Per-service DBs, partitioned `messages`, K8s HPA, CDN media |
| High concurrent WebSockets | ✅ Architecture | Stateless `ws-gateway` pods, `WS_MAX_CONNECTIONS_PER_NODE` (default 50k) |
| Realtime synchronization | ✅ | `after_seq` REST sync + WS `message.new` / `sync.required` |
| Low-latency delivery | ✅ | Redis pub/sub node channels, local fan-out, optimistic UI |
| Distributed infrastructure | ✅ | Microservices + Redis + nginx; K8s target in DEPLOYMENT |
| Failover support | 🟡 | Redis Cluster failover, Postgres PITR, WS retry stream `nexa:mq:retry` |
| Horizontal scaling | ✅ | `fanout_event()` + multi-connection registry SET per user |
| Caching layer | ✅ | `RedisCache`, sync TTL cache, rate limits, presence TTL |
| Optimized DB queries | 🟡 Schema | Partitioned messages, indexes in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) |

---

## WebSocket path (low latency)

```
Client ──WS──► ws-gateway pod (node_id)
                    │
                    ├─► ConnectionManager (local sockets)
                    └─► Redis SET nexa:ws:conns:{user_id}
                              │
chat-service ──publish──► fanout_event() ──► PUBLISH nexa:ws:node:{node_id}
                              │
                         peer pods deliver to local connections
```

- **Multi-device:** each tab/device adds `node_id:conn_id` to the user SET; disconnect removes one member only.
- **Backpressure:** per-connection rate limit (`per_conn_rate_per_second`), max frame size, capacity close `1013`.
- **Offline:** `nexa:mq:retry` stream + client offline queue (frontend).

**Ops:** `GET /stats` and `GET /health/ready` on ws-gateway (connections + Redis ping).

---

## Sync & read path

| Endpoint | Optimization |
|----------|----------------|
| `GET .../sync?after_seq=` | 3s Redis cache (`nexa:sync:*`), 200 msg page, `sync_required` flag |
| `list_messages` | Cursor by `seq`; DB: `(conversation_id, seq)` PK on partitioned table |
| Conversations | Member index `idx_members_user` |

Invalidate: short TTL on sync cache; writes publish WS events immediately.

---

## Caching (Redis)

| Prefix | Purpose | TTL |
|--------|---------|-----|
| `nexa:ws:conns:{user}` | WS route SET | heartbeat ×3 |
| `nexa:sync:{hash}` | Sync response | 3s |
| `nexa:cache:*` | Generic cache-aside (`RedisCache`) | per key |
| `nexa:rate:*` | API rate limits | 60s |
| `nexa:mq:retry` | WS delivery retry | stream |

**Production:** Redis Cluster, 3+ shards, AOF; optional hot conv message cache (last N msgs).

---

## Horizontal scale checklist

1. **ws-gateway:** `docker compose up --scale ws-gateway=4` or K8s HPA 5–100 on connection metric.
2. **Set `WS_NODE_ID`** unique per pod (or auto UUID).
3. **api-gateway / chat-service:** scale on CPU; stateless.
4. **Postgres:** PgBouncer + read replicas for sync/list reads.
5. **nginx:** `proxy_read_timeout` 86400 for WS; separate upstream pool for ws-gateway in prod.

---

## Database (when migrated)

- **Partition** `messages` by `HASH(conversation_id)` (32 partitions documented).
- **Indexes:** `(conversation_id, seq)` PK, `client_msg_id` unique, thread index.
- **Archival:** cold storage for messages older than policy window.

---

## Frontend performance

- `content-visibility` on message rows (`motion.css`)
- IndexedDB media blob cache
- Offline outbound queue + reconnect backoff
- Optimistic send + patch on `message.send.ok`

---

## SLO targets (production)

| Metric | Target |
|--------|--------|
| Message delivery p99 | < 150 ms (same region) |
| WS connect | < 500 ms |
| API availability | 99.9% |
| Sync catch-up | < 1 s for 200 messages |

See [REALTIME.md](./REALTIME.md), [DEPLOYMENT.md](./DEPLOYMENT.md).
