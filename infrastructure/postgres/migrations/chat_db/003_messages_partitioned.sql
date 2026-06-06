-- Hash-partitioned messages: co-locate all rows for a conversation_id (32 partitions).
-- Sharding note: conversation_id is the shard key; scale out with Citus/FDW per partition set.

CREATE TABLE messages (
  id                      UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id         UUID NOT NULL,
  seq                     BIGINT NOT NULL,
  sender_id               UUID NOT NULL,
  client_msg_id           TEXT,
  body_enc                BYTEA,
  content_type            TEXT NOT NULL DEFAULT 'text',
  reply_to_id             UUID,
  forward_from_id         UUID,
  thread_root_id          UUID,
  media_id                UUID,
  e2ee_envelope           JSONB,
  expires_at              TIMESTAMPTZ,
  edited_at               TIMESTAMPTZ,
  scheduled_at            TIMESTAMPTZ,
  silent                  BOOLEAN NOT NULL DEFAULT false,
  -- Soft delete (global / for-everyone)
  deleted_at              TIMESTAMPTZ,
  deleted_by              UUID,
  delete_reason           TEXT,
  deleted_for_everyone_at TIMESTAMPTZ,
  -- Full-text (non-E2EE or client search tokens only; never store plaintext E2EE body)
  search_text             TEXT,
  hashtags                TEXT[] NOT NULL DEFAULT '{}',
  mentions                UUID[] NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, seq),
  CONSTRAINT messages_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) PARTITION BY HASH (conversation_id);

DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS messages_p%s PARTITION OF messages
         FOR VALUES WITH (MODULUS 32, REMAINDER %s)',
      i, i
    );
  END LOOP;
END $$;

-- Global message id lookup (partition key required for direct seq access)
CREATE UNIQUE INDEX idx_messages_global_id ON messages(id, conversation_id);

CREATE UNIQUE INDEX idx_messages_client_dedup ON messages(conversation_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_messages_timeline ON messages(conversation_id, seq DESC)
  WHERE deleted_at IS NULL AND deleted_for_everyone_at IS NULL;

CREATE INDEX idx_messages_thread ON messages(conversation_id, thread_root_id, seq)
  WHERE thread_root_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_messages_expires ON messages(expires_at)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE message_reactions (
  message_id        UUID NOT NULL,
  conversation_id   UUID NOT NULL,
  user_id           UUID NOT NULL,
  emoji             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON message_reactions(conversation_id, message_id)
  WHERE deleted_at IS NULL;

-- Per-user soft hide (delete for me)
CREATE TABLE message_user_state (
  conversation_id   UUID NOT NULL,
  message_id        UUID NOT NULL,
  user_id           UUID NOT NULL,
  hidden_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id, user_id)
);

CREATE INDEX idx_message_user_state_user ON message_user_state(user_id, conversation_id);

CREATE TABLE read_receipts (
  conversation_id   UUID NOT NULL,
  user_id           UUID NOT NULL,
  up_to_seq         BIGINT NOT NULL,
  read_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE delivery_receipts (
  conversation_id   UUID NOT NULL,
  message_id        UUID NOT NULL,
  user_id           UUID NOT NULL,
  delivered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id, user_id)
);

CREATE INDEX idx_delivery_message ON delivery_receipts(conversation_id, message_id);

CREATE TABLE pinned_messages (
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id        UUID NOT NULL,
  pinned_by         UUID NOT NULL,
  pinned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  unpinned_at       TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX idx_pinned_active ON pinned_messages(conversation_id)
  WHERE unpinned_at IS NULL;

CREATE TABLE moderation_log (
  id                BIGSERIAL PRIMARY KEY,
  conversation_id   UUID NOT NULL,
  actor_id          UUID NOT NULL,
  target_user_id    UUID,
  target_message_id UUID,
  action            TEXT NOT NULL,
  reason            TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_conv_time ON moderation_log(conversation_id, created_at DESC);
