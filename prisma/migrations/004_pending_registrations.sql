-- Self-service trial registration queue
CREATE TABLE IF NOT EXISTS pending_registrations (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email     TEXT        NOT NULL,
  otp_hash  TEXT        NOT NULL,
  payload   JSONB       NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  attempts  INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pr_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_pr_expires ON pending_registrations(expires_at);
