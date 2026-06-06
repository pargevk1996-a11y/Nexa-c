-- user_db: profiles table

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id                       TEXT PRIMARY KEY,
  username                 TEXT NOT NULL,
  uid                      TEXT NOT NULL,
  nickname                 TEXT NOT NULL DEFAULT '',
  bio                      TEXT NOT NULL DEFAULT '',
  status_text              TEXT NOT NULL DEFAULT '',
  avatar_url               TEXT,
  animated_avatar_url      TEXT,
  avatar_kind              TEXT NOT NULL DEFAULT 'initial',
  is_online                BOOLEAN NOT NULL DEFAULT false,
  last_seen_at             TIMESTAMPTZ,
  verification_badge       TEXT NOT NULL DEFAULT 'none',
  show_last_seen           BOOLEAN NOT NULL DEFAULT true,
  show_online_status       BOOLEAN NOT NULL DEFAULT true,
  show_bio                 BOOLEAN NOT NULL DEFAULT true,
  show_status_text         BOOLEAN NOT NULL DEFAULT true,
  show_avatar              BOOLEAN NOT NULL DEFAULT true,
  allow_search_by_username BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uid            ON profiles(uid);
CREATE        INDEX IF NOT EXISTS idx_profiles_search_gin     ON profiles USING gin(
  to_tsvector('simple', username || ' ' || coalesce(nickname, '') || ' ' || uid)
);

INSERT INTO schema_migrations (version) VALUES ('user_db/001_schema')
ON CONFLICT DO NOTHING;
