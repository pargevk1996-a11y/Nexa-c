-- Generated tsvector for full-text search (English + simple fallback).
-- search_text must be populated only for server-visible plaintext or hashed search tokens.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.search_text, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.hashtags, ' '), '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_search_vector
  BEFORE INSERT OR UPDATE OF search_text, hashtags ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();

CREATE INDEX idx_messages_fts ON messages USING GIN (search_vector);

-- Trigram index for prefix / fuzzy username-in-message search on search_text
CREATE INDEX idx_messages_search_trgm ON messages USING GIN (search_text gin_trgm_ops)
  WHERE search_text IS NOT NULL AND deleted_at IS NULL;

-- Hashtag lookup (exact)
CREATE INDEX idx_messages_hashtags ON messages USING GIN (hashtags);

-- Mention lookup
CREATE INDEX idx_messages_mentions ON messages USING GIN (mentions);

-- Materialized helper for cross-conversation search (optional refresh job)
CREATE TABLE message_search_index (
  message_id        UUID NOT NULL,
  conversation_id   UUID NOT NULL,
  seq               BIGINT NOT NULL,
  sender_id         UUID NOT NULL,
  search_vector     tsvector NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  deleted_at        TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX idx_message_search_fts ON message_search_index USING GIN (search_vector);
CREATE INDEX idx_message_search_conv_time ON message_search_index(conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;
