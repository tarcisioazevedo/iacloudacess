-- TV Panel Configs — complement migration
-- Safe to run even if 002_analytics_infrastructure.sql was already applied.
-- 002 created tv_panel_configs but without a named UNIQUE constraint on access_token.
-- This migration ensures the constraint exists and the table is complete.

-- Create table only if 002 was NOT applied (new installs)
CREATE TABLE IF NOT EXISTS tv_panel_configs (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID    NOT NULL,
  unit_id          UUID,
  access_token     TEXT    NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  display_name     TEXT,
  logo_path        TEXT,
  welcome_message  TEXT,
  theme_color      TEXT    NOT NULL DEFAULT '#1b4965',
  show_photo       BOOLEAN NOT NULL DEFAULT true,
  show_class_group BOOLEAN NOT NULL DEFAULT true,
  show_clock       BOOLEAN NOT NULL DEFAULT true,
  auto_hide_seconds INT    NOT NULL DEFAULT 8,
  max_visible_cards INT    NOT NULL DEFAULT 6,
  filter_direction TEXT,
  filter_shift     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_tpc_school FOREIGN KEY (school_id)
    REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpc_unit FOREIGN KEY (unit_id)
    REFERENCES school_units(id) ON DELETE SET NULL,
  CONSTRAINT uq_tpc_access_token UNIQUE (access_token)
);

-- Add updated_at if table existed from 002 and column is missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tv_panel_configs' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tv_panel_configs ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- Add unique constraint on access_token if missing (002 only created a partial index)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'tv_panel_configs' AND constraint_name = 'uq_tpc_access_token'
  ) THEN
    ALTER TABLE tv_panel_configs ADD CONSTRAINT uq_tpc_access_token UNIQUE (access_token);
  END IF;
END $$;

-- Ensure index exists
CREATE INDEX IF NOT EXISTS idx_tpc_school_active
  ON tv_panel_configs(school_id, is_active);
