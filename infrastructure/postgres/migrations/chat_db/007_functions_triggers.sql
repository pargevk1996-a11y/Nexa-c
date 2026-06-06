-- Allocate next seq per conversation (atomic)
CREATE OR REPLACE FUNCTION next_message_seq(p_conversation_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  INSERT INTO conversation_sequences (conversation_id, next_seq)
  VALUES (p_conversation_id, 2)
  ON CONFLICT (conversation_id) DO UPDATE
    SET next_seq = conversation_sequences.next_seq + 1,
        updated_at = now()
  RETURNING next_seq - 1 INTO v_seq;

  RETURN v_seq;
END;
$$;

-- Keep denormalized search index in sync (non-E2EE / searchable rows only)
CREATE OR REPLACE FUNCTION sync_message_search_index()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM message_search_index
    WHERE conversation_id = OLD.conversation_id AND message_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.search_text IS NULL AND (NEW.hashtags IS NULL OR cardinality(NEW.hashtags) = 0) THEN
    DELETE FROM message_search_index
    WHERE conversation_id = NEW.conversation_id AND message_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.deleted_for_everyone_at IS NOT NULL THEN
    UPDATE message_search_index SET deleted_at = now()
    WHERE conversation_id = NEW.conversation_id AND message_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO message_search_index (
    message_id, conversation_id, seq, sender_id, search_vector, created_at, deleted_at
  ) VALUES (
    NEW.id, NEW.conversation_id, NEW.seq, NEW.sender_id, NEW.search_vector, NEW.created_at, NULL
  )
  ON CONFLICT (conversation_id, message_id) DO UPDATE SET
    search_vector = EXCLUDED.search_vector,
    deleted_at = NULL,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_search_index
  AFTER INSERT OR UPDATE OF search_text, hashtags, deleted_at, deleted_for_everyone_at ON messages
  FOR EACH ROW EXECUTE FUNCTION sync_message_search_index();

-- Conversation audit on soft delete
CREATE OR REPLACE FUNCTION audit_conversation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO conversation_audit (conversation_id, event, actor_id, metadata)
    VALUES (NEW.id, 'soft_delete', NEW.deleted_by, jsonb_build_object('type', NEW.type));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_audit
  AFTER UPDATE OF deleted_at ON conversations
  FOR EACH ROW EXECUTE FUNCTION audit_conversation_change();

-- Schema version marker
CREATE TABLE IF NOT EXISTS schema_migrations (
  version           TEXT PRIMARY KEY,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES
  ('chat_db/001_extensions'),
  ('chat_db/002_core_tables'),
  ('chat_db/003_messages_partitioned'),
  ('chat_db/004_fulltext_search'),
  ('chat_db/005_audit_soft_delete'),
  ('chat_db/006_retention_policies'),
  ('chat_db/007_functions_triggers')
ON CONFLICT DO NOTHING;
