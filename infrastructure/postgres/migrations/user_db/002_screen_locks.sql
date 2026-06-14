-- user_db: account-wide manual screen-lock flag.
-- When locked=true, every device/browser that loads the account shows the PIN
-- lock until the correct PIN is entered (the lock follows the account, not the
-- device). Only the manual padlock lock is stored here.

CREATE TABLE IF NOT EXISTS screen_locks (
  user_id     TEXT PRIMARY KEY,
  locked      BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('user_db/002_screen_locks')
ON CONFLICT DO NOTHING;
