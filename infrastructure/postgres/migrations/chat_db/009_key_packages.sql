-- chat_db: E2EE key packages for group conversations
-- Each row stores a per-member ECIES-wrapped group AES key.
-- The server stores ciphertext only — it cannot derive the plaintext AES key.

CREATE TABLE IF NOT EXISTS key_packages (
  conversation_id  TEXT        NOT NULL,
  user_id          TEXT        NOT NULL,
  package          JSONB       NOT NULL,  -- { ephemeral_pub: string, ciphertext: string }
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_key_packages_conv ON key_packages(conversation_id);

INSERT INTO schema_migrations (version) VALUES ('chat_db/009_key_packages')
ON CONFLICT DO NOTHING;
