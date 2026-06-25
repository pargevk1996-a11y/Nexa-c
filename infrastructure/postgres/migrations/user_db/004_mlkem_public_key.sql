-- ML-KEM-768 public key column for PQXDH (#PQC) key exchange
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mlkem_public_key TEXT;

INSERT INTO schema_migrations (version) VALUES ('user_db/004_mlkem_public_key')
ON CONFLICT DO NOTHING;
