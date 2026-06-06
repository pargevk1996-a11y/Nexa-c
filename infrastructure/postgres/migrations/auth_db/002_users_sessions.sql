-- auth_db: users, sessions, qr_sessions, and short-lived verification tokens

CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  username          TEXT NOT NULL,
  uid               TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  is_email_verified BOOLEAN NOT NULL DEFAULT false,
  phone             TEXT,
  is_phone_verified BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid   ON users(uid);

CREATE TABLE IF NOT EXISTS sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label        TEXT NOT NULL DEFAULT 'Unknown device',
  refresh_token_hash  TEXT NOT NULL,
  refresh_family_id   UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked             BOOLEAN NOT NULL DEFAULT false,
  ip_hint             TEXT,
  device_fingerprint  TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_refresh_hash  ON sessions(refresh_token_hash);
CREATE        INDEX IF NOT EXISTS idx_sessions_user_active   ON sessions(user_id) WHERE NOT revoked;
CREATE        INDEX IF NOT EXISTS idx_sessions_family        ON sessions(refresh_family_id);

CREATE TABLE IF NOT EXISTS qr_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  user_id           UUID,
  session_id        UUID,
  refresh_token_raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_qr_token   ON qr_sessions(token);
CREATE INDEX IF NOT EXISTS idx_qr_expires ON qr_sessions(expires_at) WHERE status = 'pending';

-- One active code per email at a time (upsert on re-send)
CREATE TABLE IF NOT EXISTS email_verification_codes (
  email      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- One active token per request (token is the PK for O(1) lookup)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- One OTP per user at a time
CREATE TABLE IF NOT EXISTS phone_otp_codes (
  user_id    TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

INSERT INTO schema_migrations (version) VALUES ('auth_db/002_users_sessions')
ON CONFLICT DO NOTHING;
