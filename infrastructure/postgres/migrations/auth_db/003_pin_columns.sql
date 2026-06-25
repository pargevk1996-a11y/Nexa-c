-- auth_db: add PIN columns to users and sessions tables

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash    TEXT,
  ADD COLUMN IF NOT EXISTS pin_status  TEXT NOT NULL DEFAULT 'PENDING_PIN';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS pin_verified_at TIMESTAMPTZ;

INSERT INTO schema_migrations (version) VALUES ('auth_db/003_pin_columns')
ON CONFLICT DO NOTHING;
