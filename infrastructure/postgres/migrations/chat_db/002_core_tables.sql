-- Per-conversation monotonic sequence (shard-local ordering)
CREATE TABLE conversation_sequences (
  conversation_id   UUID PRIMARY KEY,
  next_seq          BIGINT NOT NULL DEFAULT 1,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT NOT NULL CHECK (type IN (
    'dm', 'private_group', 'public_group', 'supergroup', 'channel',
    'broadcast', 'community', 'secret'
  )),
  title             TEXT,
  description       TEXT,
  slug              CITEXT UNIQUE,
  is_public         BOOLEAN NOT NULL DEFAULT false,
  verified          BOOLEAN NOT NULL DEFAULT false,
  parent_id         UUID REFERENCES conversations(id) ON DELETE SET NULL,
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID
);

CREATE INDEX idx_conversations_type ON conversations(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_parent ON conversations(parent_id) WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE conversation_members (
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  role              TEXT NOT NULL DEFAULT 'member',
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at           TIMESTAMPTZ,
  muted_until       TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_members_user_active ON conversation_members(user_id) WHERE left_at IS NULL;

CREATE TABLE user_chat_state (
  user_id           UUID NOT NULL,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pinned            BOOLEAN NOT NULL DEFAULT false,
  archived          BOOLEAN NOT NULL DEFAULT false,
  folder_id         UUID,
  hidden            BOOLEAN NOT NULL DEFAULT false,
  mute_until        TIMESTAMPTZ,
  draft             TEXT,
  last_read_seq     BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX idx_user_chat_state_user ON user_chat_state(user_id, archived, pinned);

CREATE TABLE chat_folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  name              TEXT NOT NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_folders_user ON chat_folders(user_id, sort_order);
