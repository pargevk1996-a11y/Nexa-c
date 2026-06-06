-- auth_db: audit + session retention helpers

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL,
  user_id         UUID,
  event           TEXT NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS audit_log_default PARTITION OF audit_log DEFAULT;

CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_log(event, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  audit_ttl_days  INT NOT NULL DEFAULT 365,
  enabled         BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO audit_retention_policies (name, audit_ttl_days)
SELECT 'default', 365
WHERE NOT EXISTS (SELECT 1 FROM audit_retention_policies WHERE name = 'default');

CREATE OR REPLACE FUNCTION purge_auth_audit(p_batch_size INT DEFAULT 2000)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_days INT;
  v_deleted INT;
BEGIN
  SELECT audit_ttl_days INTO v_days FROM audit_retention_policies
  WHERE enabled = true ORDER BY created_at LIMIT 1;
  IF v_days IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM audit_log
  WHERE created_at < now() - (v_days || ' days')::interval
    AND ctid IN (
      SELECT ctid FROM audit_log
      WHERE created_at < now() - (v_days || ' days')::interval
      LIMIT p_batch_size
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('auth_db/001_audit_enhanced')
ON CONFLICT DO NOTHING;
