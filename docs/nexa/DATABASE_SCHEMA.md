# Nexa — Database Schema

> **Reference** for fields and service boundaries. **Executable migrations:** `infrastructure/postgres/migrations/` (applied via `make db-migrate` or Postgres init).  
> **Architecture:** [DATABASE.md](./DATABASE.md) — partitioning, sharding, FTS, retention, audit.

Runtime chat/auth stores are still **in-memory** until repository cutover; SQL schema is ready.

Databases: see `infrastructure/postgres/init/01-databases.sql`

---

## auth_db

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  password_hash   TEXT,                    -- Argon2id, NULL if OAuth-only
  phone           TEXT UNIQUE,
  phone_verified  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  device_name     TEXT,
  refresh_hash    TEXT NOT NULL,           -- hashed refresh token
  ip_address      INET,
  user_agent      TEXT,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE INDEX idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE totp_secrets (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc      BYTEA NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  backup_codes    JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE oauth_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,           -- google, github
  provider_sub    TEXT NOT NULL,
  UNIQUE (provider, provider_sub)
);

CREATE TABLE qr_login_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, expired
  user_id         UUID REFERENCES users(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID,
  event           TEXT NOT NULL,
  ip_address      INET,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, created_at DESC);
```

---

## user_db

```sql
CREATE TABLE profiles (
  user_id         UUID PRIMARY KEY,
  username        CITEXT UNIQUE NOT NULL,
  uid             TEXT UNIQUE NOT NULL,    -- public @handle id
  nickname        TEXT,
  bio             TEXT,
  status_text     TEXT,
  avatar_media_id UUID,
  avatar_animated BOOLEAN NOT NULL DEFAULT false,
  verified        BOOLEAN NOT NULL DEFAULT false,
  last_seen_at    TIMESTAMPTZ,
  last_seen_privacy TEXT NOT NULL DEFAULT 'contacts',  -- everyone, contacts, nobody
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_username ON profiles(username text_pattern_ops);

CREATE TABLE privacy_settings (
  user_id         UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  show_online     TEXT NOT NULL DEFAULT 'everyone',
  show_last_seen  TEXT NOT NULL DEFAULT 'contacts',
  allow_calls     TEXT NOT NULL DEFAULT 'everyone',
  allow_groups    TEXT NOT NULL DEFAULT 'everyone',
  phone_visible   TEXT NOT NULL DEFAULT 'nobody'
);

CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY,
  theme           TEXT NOT NULL DEFAULT 'system',
  locale          TEXT NOT NULL DEFAULT 'en',
  font_scale      REAL NOT NULL DEFAULT 1.0,
  chat_background TEXT,
  enter_to_send   BOOLEAN NOT NULL DEFAULT true,
  notifications   JSONB NOT NULL DEFAULT '{}'
);
```

---

## contact_db

```sql
CREATE TABLE contacts (
  owner_id        UUID NOT NULL,
  contact_user_id UUID NOT NULL,
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_user_id)
);

CREATE TABLE blocks (
  blocker_id      UUID NOT NULL,
  blocked_id      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE invite_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        UUID NOT NULL,
  code            TEXT NOT NULL UNIQUE,
  created_by      UUID NOT NULL,
  max_uses        INT,
  use_count       INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## chat_db (partitioned messages)

> Implemented in `migrations/chat_db/002`–`007`. Includes soft delete, audit, retention, FTS, `messages_p0`–`p31`.

```sql
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,           -- dm, private_group, channel, ...
  title           TEXT,
  description     TEXT,
  slug            CITEXT UNIQUE,
  is_public       BOOLEAN NOT NULL DEFAULT false,
  verified        BOOLEAN NOT NULL DEFAULT false,
  parent_id       UUID REFERENCES conversations(id),
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted_until     TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_members_user ON conversation_members(user_id);

CREATE TABLE messages (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  seq             BIGINT NOT NULL,
  sender_id       UUID NOT NULL,
  client_msg_id   TEXT,
  body_enc        BYTEA,                   -- server AES-GCM or E2EE envelope
  content_type    TEXT NOT NULL DEFAULT 'text',
  reply_to_id     UUID,
  forward_from_id UUID,
  thread_root_id  UUID,
  media_id        UUID,
  e2ee_envelope   JSONB,
  expires_at      TIMESTAMPTZ,
  edited_at       TIMESTAMPTZ,
  deleted_for_everyone_at TIMESTAMPTZ,
  scheduled_at    TIMESTAMPTZ,
  silent          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, seq)
) PARTITION BY HASH (conversation_id);

-- Create 32 partitions: messages_p0 .. messages_p31

CREATE UNIQUE INDEX idx_messages_id ON messages(id);
CREATE UNIQUE INDEX idx_messages_client ON messages(conversation_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;
CREATE INDEX idx_messages_thread ON messages(conversation_id, thread_root_id, seq);

CREATE TABLE message_reactions (
  message_id      UUID NOT NULL,
  conversation_id UUID NOT NULL,
  user_id         UUID NOT NULL,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE read_receipts (
  conversation_id UUID NOT NULL,
  user_id         UUID NOT NULL,
  up_to_seq       BIGINT NOT NULL,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE delivery_receipts (
  message_id      UUID NOT NULL,
  user_id         UUID NOT NULL,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE pinned_messages (
  conversation_id UUID NOT NULL,
  message_id      UUID NOT NULL,
  pinned_by       UUID NOT NULL,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE user_chat_state (
  user_id         UUID NOT NULL,
  conversation_id UUID NOT NULL,
  pinned          BOOLEAN NOT NULL DEFAULT false,
  archived        BOOLEAN NOT NULL DEFAULT false,
  folder_id       UUID,
  hidden          BOOLEAN NOT NULL DEFAULT false,
  mute_until      TIMESTAMPTZ,
  draft           TEXT,
  PRIMARY KEY (user_id, conversation_id)
);

CREATE TABLE chat_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  name            TEXT NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE TABLE moderation_log (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL,
  actor_id        UUID NOT NULL,
  target_user_id  UUID,
  action          TEXT NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## media_db

```sql
CREATE TABLE media_objects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  conversation_id UUID,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  width           INT,
  height          INT,
  duration_ms     INT,
  storage_key     TEXT NOT NULL,
  encryption_iv   BYTEA,
  checksum_sha256 TEXT,
  transcode_status TEXT NOT NULL DEFAULT 'pending',
  preview_key     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_owner ON media_objects(owner_id, created_at DESC);
CREATE INDEX idx_media_conv ON media_objects(conversation_id) WHERE conversation_id IS NOT NULL;

CREATE TABLE upload_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  total_bytes     BIGINT NOT NULL,
  chunk_size      INT NOT NULL,
  received_chunks INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## notification_db

```sql
CREATE TABLE push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  platform        TEXT NOT NULL,           -- web, fcm, apns
  endpoint        TEXT NOT NULL,
  keys            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE notification_preferences (
  user_id         UUID NOT NULL,
  conversation_id UUID,                    -- NULL = global default
  mute_until      TIMESTAMPTZ,
  sound           TEXT,
  preview         BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, conversation_id)
);

CREATE TABLE notification_outbox (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_pending ON notification_outbox(status, created_at) WHERE status = 'pending';
```

---

## story_db

```sql
CREATE TABLE stories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  media_id        UUID NOT NULL,
  caption         TEXT,
  privacy         TEXT NOT NULL DEFAULT 'contacts',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stories_user ON stories(user_id, created_at DESC);

CREATE TABLE story_views (
  story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id       UUID NOT NULL,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reaction        TEXT,
  PRIMARY KEY (story_id, viewer_id)
);
```

---

## emoji_db

```sql
CREATE TABLE sticker_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  animated        BOOLEAN NOT NULL DEFAULT true,
  is_official     BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE stickers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  emoji_fallback  TEXT,
  file_key        TEXT NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0
);

CREATE TABLE user_sticker_favorites (
  user_id         UUID NOT NULL,
  sticker_id      UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, sticker_id)
);
```

---

## Indexing & search (OpenSearch mapping)

```json
{
  "messages": {
    "properties": {
      "conversation_id": { "type": "keyword" },
      "sender_id": { "type": "keyword" },
      "body": { "type": "text", "analyzer": "standard" },
      "hashtags": { "type": "keyword" },
      "mentions": { "type": "keyword" },
      "created_at": { "type": "date" },
      "content_type": { "type": "keyword" }
    }
  }
}
```

---

## Migration strategy

1. **SQL migrations** (current): `infrastructure/postgres/migrations/{chat_db,auth_db}/`
2. Phase 2a: auth + user + sessions tables
3. Phase 2b: chat repository dual-write from `chat_store`
4. Phase 2c: media metadata, receipts, reactions
5. Phase 2d: cutover, remove in-memory stores
6. Optional: Alembic wrappers per service for incremental deltas

---

See [DATABASE.md](./DATABASE.md) · [PLATFORM_SPEC.md](./PLATFORM_SPEC.md).
