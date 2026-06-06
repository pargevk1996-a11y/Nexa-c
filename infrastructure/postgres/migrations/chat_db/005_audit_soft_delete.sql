-- Audit tables (append-only, partitioned by month for retention)

CREATE TABLE conversation_audit (
  id                BIGSERIAL,
  conversation_id   UUID NOT NULL,
  event             TEXT NOT NULL,
  actor_id          UUID,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE conversation_audit_default PARTITION OF conversation_audit DEFAULT;

CREATE TABLE message_audit (
  id                BIGSERIAL,
  conversation_id   UUID NOT NULL,
  message_id        UUID,
  seq               BIGINT,
  event             TEXT NOT NULL,
  actor_id          UUID,
  old_value         JSONB,
  new_value         JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE message_audit_default PARTITION OF message_audit DEFAULT;

CREATE INDEX idx_message_audit_conv ON message_audit(conversation_id, created_at DESC);
CREATE INDEX idx_message_audit_message ON message_audit(message_id, created_at DESC)
  WHERE message_id IS NOT NULL;
CREATE INDEX idx_conversation_audit_conv ON conversation_audit(conversation_id, created_at DESC);

-- Active messages view (excludes soft + for-everyone delete)
CREATE OR REPLACE VIEW messages_active AS
SELECT *
FROM messages
WHERE deleted_at IS NULL
  AND deleted_for_everyone_at IS NULL;

COMMENT ON VIEW messages_active IS 'Timeline queries should prefer this view or equivalent WHERE clause';

-- Soft-delete helper: delete for everyone
CREATE OR REPLACE FUNCTION soft_delete_message_for_everyone(
  p_conversation_id UUID,
  p_message_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  UPDATE messages
  SET deleted_at = now(),
      deleted_by = p_actor_id,
      delete_reason = p_reason,
      deleted_for_everyone_at = COALESCE(deleted_for_everyone_at, now())
  WHERE conversation_id = p_conversation_id
    AND id = p_message_id
    AND deleted_at IS NULL
  RETURNING seq INTO v_seq;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO message_audit (
    conversation_id, message_id, seq, event, actor_id, new_value
  ) VALUES (
    p_conversation_id, p_message_id, v_seq, 'soft_delete_everyone', p_actor_id,
    jsonb_build_object('reason', p_reason)
  );

  UPDATE message_search_index SET deleted_at = now()
  WHERE conversation_id = p_conversation_id AND message_id = p_message_id;

  RETURN true;
END;
$$;

-- Soft-delete for me (per user)
CREATE OR REPLACE FUNCTION soft_hide_message_for_user(
  p_conversation_id UUID,
  p_message_id UUID,
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO message_user_state (conversation_id, message_id, user_id)
  VALUES (p_conversation_id, p_message_id, p_user_id)
  ON CONFLICT (conversation_id, message_id, user_id) DO UPDATE
    SET hidden_at = now();

  INSERT INTO message_audit (
    conversation_id, message_id, event, actor_id, new_value
  ) VALUES (
    p_conversation_id, p_message_id, 'soft_hide_user', p_user_id, '{}'::jsonb
  );
END;
$$;
