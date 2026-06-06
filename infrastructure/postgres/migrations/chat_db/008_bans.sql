-- chat_db: conversation bans for per-conversation ban tracking

CREATE TABLE IF NOT EXISTS conversation_bans (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  banned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_bans ON conversation_bans(conversation_id);

INSERT INTO schema_migrations (version) VALUES ('chat_db/008_bans')
ON CONFLICT DO NOTHING;
