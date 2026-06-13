-- contact_db schema — contact requests and blocked users

CREATE TABLE IF NOT EXISTS contact_requests (
    id               TEXT PRIMARY KEY,
    from_user_id     TEXT NOT NULL,
    to_user_id       TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
    conversation_id  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cr_from_to    ON contact_requests(from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS idx_cr_to_status  ON contact_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_cr_from_status ON contact_requests(from_user_id, status);

CREATE TABLE IF NOT EXISTS blocked_users (
    owner_id         TEXT NOT NULL,
    blocked_user_id  TEXT NOT NULL,
    reason           TEXT,
    blocked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, blocked_user_id)
);
