-- notification_db: push subscriptions, preferences, grouped outbox

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('web', 'fcm', 'apns', 'desktop')),
  endpoint        TEXT NOT NULL,
  keys            JSONB,
  device_name     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

CREATE TABLE notification_preferences (
  user_id           UUID NOT NULL,
  conversation_id   UUID,
  mute_until        TIMESTAMPTZ,
  mute_all          BOOLEAN NOT NULL DEFAULT false,
  mentions_only     BOOLEAN NOT NULL DEFAULT false,
  push_enabled      BOOLEAN NOT NULL DEFAULT true,
  desktop_enabled   BOOLEAN NOT NULL DEFAULT true,
  mobile_enabled    BOOLEAN NOT NULL DEFAULT true,
  preview           BOOLEAN NOT NULL DEFAULT true,
  sound             BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end   TIME,
  group_notifications BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE UNIQUE INDEX idx_notif_prefs_global ON notification_preferences(user_id)
  WHERE conversation_id IS NULL;

CREATE TABLE notification_groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  conversation_id   UUID NOT NULL,
  collapse_key      TEXT NOT NULL,
  message_count     INT NOT NULL DEFAULT 1,
  latest_title      TEXT NOT NULL,
  latest_body       TEXT NOT NULL,
  silent            BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

CREATE TABLE notification_outbox (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL,
  platform          TEXT NOT NULL,
  collapse_key      TEXT,
  group_count       INT NOT NULL DEFAULT 1,
  payload           JSONB NOT NULL,
  silent            BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'pending',
  attempts          INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON notification_outbox(status, created_at)
  WHERE status = 'pending';

CREATE TABLE notification_audit (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID,
  event           TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('notification_db/001_schema')
ON CONFLICT DO NOTHING;
