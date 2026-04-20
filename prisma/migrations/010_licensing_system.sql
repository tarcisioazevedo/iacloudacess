-- ═══════════════════════════════════════════════════════════════
-- Migration 010: Licensing System & School Billing
-- New tables: license_events, school_billing_events,
--             blocked_documents, platform_configs
-- Extended columns on: integrators, licenses, schools,
--                       pending_registrations
-- ═══════════════════════════════════════════════════════════════

-- ─── Extend integrators ──────────────────────────────────────
ALTER TABLE integrators
  ADD COLUMN IF NOT EXISTS cnpj            VARCHAR(14) UNIQUE,
  ADD COLUMN IF NOT EXISTS trade_name      TEXT,
  ADD COLUMN IF NOT EXISTS contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS contact_email   TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone   TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS notes           TEXT,
  ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_blocked_at  TIMESTAMPTZ;

-- ─── Extend licenses ─────────────────────────────────────────
ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS grace_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewed_from_id  TEXT REFERENCES licenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notified_at_30d  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at_14d  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at_7d   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at_3d   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at_1d   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_expiry  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_grace   TIMESTAMPTZ;

-- ─── Extend schools ──────────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS billing_status              TEXT    DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS billing_note                TEXT,
  ADD COLUMN IF NOT EXISTS billing_valid_until         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_warning_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_block_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_updated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_updated_by          TEXT,
  ADD COLUMN IF NOT EXISTS allow_photo_notifications   BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Extend pending_registrations ────────────────────────────
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS document  TEXT,
  ADD COLUMN IF NOT EXISTS doc_type  TEXT;

-- ─── New table: license_events ───────────────────────────────
CREATE TABLE IF NOT EXISTS license_events (
  id          TEXT        NOT NULL PRIMARY KEY,
  license_id  TEXT        NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  event       TEXT        NOT NULL,
  prev_status TEXT,
  next_status TEXT,
  actor_id    TEXT,
  note        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_events_license_id_created ON license_events(license_id, created_at);

-- ─── New table: school_billing_events ────────────────────────
CREATE TABLE IF NOT EXISTS school_billing_events (
  id          TEXT        NOT NULL PRIMARY KEY,
  school_id   TEXT        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event       TEXT        NOT NULL,
  prev_status TEXT,
  next_status TEXT,
  actor_id    TEXT,
  note        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_billing_events_school_id_created ON school_billing_events(school_id, created_at);

-- ─── New table: blocked_documents ────────────────────────────
-- Tracks CNPJs/CPFs blocked after trial abuse.
CREATE TABLE IF NOT EXISTS blocked_documents (
  id            TEXT        NOT NULL PRIMARY KEY,
  document      TEXT        NOT NULL UNIQUE,
  doc_type      TEXT        NOT NULL,   -- 'cnpj' | 'cpf'
  reason        TEXT        NOT NULL DEFAULT 'trial_used',  -- trial_used | manual | abuse
  integrator_id TEXT        REFERENCES integrators(id) ON DELETE SET NULL,
  note          TEXT,
  blocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_blocked_documents_document ON blocked_documents(document);

-- ─── New table: platform_configs ─────────────────────────────
-- Singleton row (id = 'singleton'). Dynamic platform config.
CREATE TABLE IF NOT EXISTS platform_configs (
  id                     TEXT    NOT NULL PRIMARY KEY DEFAULT 'singleton',
  -- Trial policy
  trial_days             INTEGER NOT NULL DEFAULT 7,
  trial_max_schools      INTEGER NOT NULL DEFAULT 1,
  trial_max_devices      INTEGER NOT NULL DEFAULT 1,
  trial_grace_days       INTEGER NOT NULL DEFAULT 0,
  trial_block_on_expiry  BOOLEAN NOT NULL DEFAULT TRUE,
  -- Commercial license grace
  license_grace_days     INTEGER NOT NULL DEFAULT 12,
  -- SMTP
  smtp_host              TEXT,
  smtp_port              INTEGER,
  smtp_user              TEXT,
  smtp_pass_enc          TEXT,
  smtp_from              TEXT,
  smtp_from_name         TEXT,
  smtp_secure            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Email templates
  email_trial_welcome        TEXT,
  email_license_expiring_30  TEXT,
  email_license_expiring_7   TEXT,
  email_license_expiring_1   TEXT,
  email_license_expired      TEXT,
  email_license_grace        TEXT,
  email_trial_expiring_2d    TEXT,
  email_trial_expiring_1d    TEXT,
  email_trial_expired        TEXT,
  email_school_warning       TEXT,
  email_school_blocked       TEXT,
  -- Audit
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             TEXT
);

-- Ensure singleton row exists on first deploy
INSERT INTO platform_configs (id) VALUES ('singleton')
  ON CONFLICT (id) DO NOTHING;
