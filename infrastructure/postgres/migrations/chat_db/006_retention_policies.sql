-- Retention policies: TTL, legal hold, hard-delete after soft-delete grace period

CREATE TABLE retention_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  scope                 TEXT NOT NULL CHECK (scope IN ('global', 'conversation_type', 'conversation')),
  scope_value           TEXT,
  message_ttl_days      INT,
  media_ttl_days        INT,
  soft_delete_grace_days INT NOT NULL DEFAULT 30,
  hard_delete_after_days INT,
  legal_hold            BOOLEAN NOT NULL DEFAULT false,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_retention_scope ON retention_policies(scope, scope_value)
  WHERE enabled = true;

-- Default global policy (7y messages, 90d ephemeral override via expires_at)
INSERT INTO retention_policies (name, scope, scope_value, message_ttl_days, soft_delete_grace_days, hard_delete_after_days)
SELECT 'default_global', 'global', NULL, 2555, 30, 365
WHERE NOT EXISTS (SELECT 1 FROM retention_policies WHERE name = 'default_global');

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS retention_policy_id UUID;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS fk_conversations_retention;

ALTER TABLE conversations
  ADD CONSTRAINT fk_conversations_retention
  FOREIGN KEY (retention_policy_id) REFERENCES retention_policies(id)
  ON DELETE SET NULL;

-- Tombstone archive before hard delete (cold storage pointer)
CREATE TABLE message_tombstones (
  conversation_id     UUID NOT NULL,
  message_id          UUID NOT NULL,
  seq                 BIGINT NOT NULL,
  sender_id           UUID NOT NULL,
  content_type        TEXT NOT NULL,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  storage_ref         TEXT,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX idx_message_tombstones_archived ON message_tombstones(archived_at);

-- Apply retention: soft-deleted rows past grace → tombstone + hard delete
CREATE OR REPLACE FUNCTION apply_message_retention(p_batch_size INT DEFAULT 500)
RETURNS TABLE(hard_deleted INT, tombstoned INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_hard INT := 0;
  v_tomb INT := 0;
  v_grace_days INT;
  v_policy retention_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_policy FROM retention_policies
  WHERE scope = 'global' AND enabled = true
  ORDER BY created_at
  LIMIT 1;

  v_grace_days := COALESCE(v_policy.soft_delete_grace_days, 30);

  WITH doomed AS (
    SELECT m.conversation_id, m.id AS message_id, m.seq, m.sender_id, m.content_type
    FROM messages m
    WHERE m.deleted_at IS NOT NULL
      AND m.deleted_at < now() - (v_grace_days || ' days')::interval
      AND NOT COALESCE(v_policy.legal_hold, false)
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  ins AS (
    INSERT INTO message_tombstones (conversation_id, message_id, seq, sender_id, content_type)
    SELECT conversation_id, message_id, seq, sender_id, content_type FROM doomed
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_tomb FROM ins;

  WITH doomed AS (
    SELECT m.conversation_id, m.seq
    FROM messages m
    WHERE m.deleted_at IS NOT NULL
      AND m.deleted_at < now() - (v_grace_days || ' days')::interval
      AND NOT COALESCE(v_policy.legal_hold, false)
    LIMIT p_batch_size
  )
  DELETE FROM messages m
  USING doomed d
  WHERE m.conversation_id = d.conversation_id AND m.seq = d.seq;

  GET DIAGNOSTICS v_hard = ROW_COUNT;

  -- Ephemeral messages past expires_at
  DELETE FROM messages m
  WHERE m.expires_at IS NOT NULL
    AND m.expires_at < now()
    AND m.deleted_at IS NULL
    AND NOT COALESCE(v_policy.legal_hold, false)
    AND m.ctid IN (
      SELECT ctid FROM messages
      WHERE expires_at IS NOT NULL AND expires_at < now()
      LIMIT p_batch_size
    );

  v_hard := v_hard + ROW_COUNT;

  hard_deleted := v_hard;
  tombstoned := v_tomb;
  RETURN NEXT;
END;
$$;

-- TTL purge for conversations with message_ttl_days
CREATE OR REPLACE FUNCTION purge_messages_older_than_ttl(p_batch_size INT DEFAULT 1000)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INT;
  v_days INT;
BEGIN
  SELECT message_ttl_days INTO v_days FROM retention_policies
  WHERE scope = 'global' AND enabled = true LIMIT 1;

  IF v_days IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM messages
  WHERE created_at < now() - (v_days || ' days')::interval
    AND deleted_at IS NULL
    AND ctid IN (
      SELECT ctid FROM messages
      WHERE created_at < now() - (v_days || ' days')::interval
        AND deleted_at IS NULL
      LIMIT p_batch_size
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
