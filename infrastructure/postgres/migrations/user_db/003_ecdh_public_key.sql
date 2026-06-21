-- user_db: add ECDH P-256 public key for E2EE key agreement
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ecdh_public_key TEXT;

INSERT INTO schema_migrations (version) VALUES ('user_db/003_ecdh_public_key')
ON CONFLICT DO NOTHING;
