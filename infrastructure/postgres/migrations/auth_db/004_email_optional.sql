-- auth_db: make email optional to support anonymous (username-only) registration

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Replace unconditional unique index with a partial one so NULLs don't conflict.
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(lower(email))
    WHERE email IS NOT NULL;

-- Unique index on username so anonymous users always have a unique identifier.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
    ON users(lower(username));

INSERT INTO schema_migrations (version) VALUES ('auth_db/004_email_optional')
ON CONFLICT DO NOTHING;
