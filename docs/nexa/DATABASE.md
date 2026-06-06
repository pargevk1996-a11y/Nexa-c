# Nexa — Database architecture

> **Status:** SQL migrations implemented for `chat_db` and `auth_db` audit. Runtime stores still in-memory until repository cutover.

**Migrations:** `infrastructure/postgres/migrations/`  
**Apply:** `make db-migrate` or auto on fresh `docker compose up` (init hook)

See also: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) (field reference) · [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)

---

## 1. Scalable schema

| Principle | Implementation |
|-----------|----------------|
| Per-service DB | `auth_db`, `chat_db`, `media_db`, … (`01-databases.sql`) |
| Shard key | `conversation_id` — all messages for a chat co-located |
| Ordering | Monotonic `seq` per conversation via `conversation_sequences` |
| Hot rows | Narrow `messages` table; reactions/receipts separate |
| ID lookup | `UNIQUE (id, conversation_id)` on partitioned parent |

---

## 2. Partitioning (PostgreSQL HASH)

```
messages PARTITION BY HASH (conversation_id)
  ├── messages_p0  (remainder 0)
  ├── …
  └── messages_p31 (remainder 31)
```

- **32 partitions** default (`MESSAGE_PARTITION_COUNT` in `app/db/sharding.py`)
- Timeline queries always filter `conversation_id` → single partition prune
- Adding partitions: create new `PARTITION OF` with higher modulus (migration required)

---

## 3. Sharding strategy (multi-node)

| Tier | Strategy |
|------|----------|
| **Single cluster** | HASH partitions on one Postgres 16 instance (current) |
| **Read scale** | Read replicas; chat list/sync from replica |
| **Write scale** | Citus / Vitess — distribute by `conversation_id` |
| **Regional** | Shard catalog: `region → conversation_id range`; WS + chat co-located per region |

**Rule:** Never scatter one conversation across shards. Cross-shard queries only in search/admin jobs.

---

## 4. Message indexing

| Index | Purpose |
|-------|---------|
| `PRIMARY KEY (conversation_id, seq)` | Timeline pagination |
| `idx_messages_timeline` | Active messages DESC (partial: not deleted) |
| `idx_messages_thread` | Thread replies |
| `idx_messages_client_dedup` | Idempotent send (`client_msg_id`) |
| `idx_messages_fts` | GIN on `search_vector` |
| `idx_messages_hashtags` / `mentions` | GIN arrays |
| `message_search_index` | Denormalized FTS table (trigger-maintained) |

---

## 5. Full-text search

- Column `search_text` — **only** for non-E2EE plaintext or client-supplied search tokens (never E2EE body)
- Generated `search_vector` = `english(search_text)` + `simple(hashtags)`
- Query API: `app/db/search.py` → `websearch_to_tsquery` + `@@` on GIN index
- Hashtag search: `WHERE tag = ANY(hashtags)` on `messages_active`
- **OpenSearch** (optional): async index via NATS for cross-conversation search at scale

---

## 6. Soft delete

| Type | Storage | Function |
|------|---------|----------|
| Delete for everyone | `messages.deleted_at`, `deleted_by`, `deleted_for_everyone_at` | `soft_delete_message_for_everyone()` |
| Delete for me | `message_user_state.hidden_at` | `soft_hide_message_for_user()` |
| Conversation delete | `conversations.deleted_at` | trigger → `conversation_audit` |

Reads use view **`messages_active`** (`deleted_at IS NULL`).

---

## 7. Retention policies

Table `retention_policies`:

| Field | Meaning |
|-------|---------|
| `message_ttl_days` | Hard purge old messages (global default 2555d) |
| `soft_delete_grace_days` | Days before soft-deleted rows are tombstoned + removed (30) |
| `hard_delete_after_days` | Policy cap for compliance archives |
| `legal_hold` | Skip all purge when true |
| `expires_at` on message | Ephemeral messages auto-deleted |

Jobs (SQL functions):

- `apply_message_retention(batch_size)` — tombstone + hard delete after grace
- `purge_messages_older_than_ttl(batch_size)` — TTL enforcement

Python: `app/db/retention.py` for async cron workers.

---

## 8. Audit tables

| Table | Events |
|-------|--------|
| `message_audit` | `soft_delete_everyone`, `soft_hide_user`, edits (extend as needed) |
| `conversation_audit` | `soft_delete`, settings changes |
| `moderation_log` | mod actions |
| `auth_db.audit_log` | auth events (partitioned, `purge_auth_audit()`) |

Append-only, **RANGE partitioned by `created_at`** (monthly partitions added in ops runbooks).

---

## 9. Operations

```bash
# Fresh Compose (runs init + migrations)
make up

# Existing Postgres volume
make db-migrate
# or
PGHOST=127.0.0.1 bash scripts/apply-db-migrations.sh

# Retention (psql)
psql -d chat_db -c "SELECT * FROM apply_message_retention(500);"
```

**Cron (production):**

| Job | Schedule | Function |
|-----|----------|----------|
| Retention | hourly | `apply_message_retention` |
| TTL purge | daily | `purge_messages_older_than_ttl` |
| Audit purge | weekly | `purge_auth_audit` |
| Search index rebuild | optional | `REFRESH` if materialized views added |

---

## 10. Cutover from in-memory store

1. Deploy migrations (`schema_migrations` table tracks versions)
2. Dual-write in `chat_store` → Postgres repository
3. Backfill mock data (dev only)
4. Read from Postgres; remove `_messages` dict
5. Enable FTS only when `search_text` populated

---

## 11. File map

```
infrastructure/postgres/
  init/01-databases.sql
  init/02-apply-migrations.sh
  migrations/chat_db/001..007_*.sql
  migrations/auth_db/001_audit_enhanced.sql
backend/chat-service/app/db/
  models.py · sharding.py · search.py · retention.py
scripts/apply-db-migrations.sh
```
