-- Analytics Infrastructure Migration
-- Creates pre-aggregated tables for cockpit dashboards
-- Run after existing Prisma migrations

-- ─── Hourly Aggregation ──────────────────────
CREATE TABLE IF NOT EXISTS analytics_hourly (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL,
  integrator_id UUID NOT NULL,
  bucket_hour   TIMESTAMPTZ NOT NULL,

  total_events      INT DEFAULT 0,
  entry_events      INT DEFAULT 0,
  exit_events       INT DEFAULT 0,
  granted_events    INT DEFAULT 0,
  denied_events     INT DEFAULT 0,
  pending_events    INT DEFAULT 0,
  unique_students   INT DEFAULT 0,

  notifications_sent    INT DEFAULT 0,
  notifications_failed  INT DEFAULT 0,

  devices_online    INT DEFAULT 0,
  devices_offline   INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT fk_ah_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_ah_integrator FOREIGN KEY (integrator_id) REFERENCES integrators(id) ON DELETE CASCADE,
  CONSTRAINT uq_ah_school_hour UNIQUE (school_id, bucket_hour)
);

CREATE INDEX IF NOT EXISTS idx_ah_school ON analytics_hourly(school_id, bucket_hour DESC);
CREATE INDEX IF NOT EXISTS idx_ah_integrator ON analytics_hourly(integrator_id, bucket_hour DESC);

-- ─── Daily Summary ───────────────────────────
CREATE TABLE IF NOT EXISTS analytics_daily (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL,
  integrator_id UUID NOT NULL,
  report_date   DATE NOT NULL,

  total_students_expected INT DEFAULT 0,
  total_students_present  INT DEFAULT 0,
  attendance_rate         DECIMAL(5,2),

  total_events        INT DEFAULT 0,
  total_entries       INT DEFAULT 0,
  total_exits         INT DEFAULT 0,
  total_denied        INT DEFAULT 0,
  total_unlinked      INT DEFAULT 0,
  peak_hour           INT,
  first_entry_time    TIME,
  last_entry_time     TIME,

  notifications_total   INT DEFAULT 0,
  notifications_sent    INT DEFAULT 0,
  notifications_failed  INT DEFAULT 0,
  delivery_rate         DECIMAL(5,2),

  avg_uptime_percent  DECIMAL(5,2),
  incidents_count     INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT fk_ad_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_ad_integrator FOREIGN KEY (integrator_id) REFERENCES integrators(id) ON DELETE CASCADE,
  CONSTRAINT uq_ad_school_date UNIQUE (school_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_school ON analytics_daily(school_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_integrator ON analytics_daily(integrator_id, report_date DESC);

-- ─── Attendance Snapshots ────────────────────
CREATE TABLE IF NOT EXISTS attendance_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL,
  student_id    UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  present       BOOLEAN DEFAULT FALSE,
  first_entry   TIMESTAMPTZ,
  last_exit     TIMESTAMPTZ,
  total_events  INT DEFAULT 0,

  CONSTRAINT fk_as_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT uq_as_student_date UNIQUE (student_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_as_school_date ON attendance_snapshots(school_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_as_student ON attendance_snapshots(student_id, snapshot_date DESC);

-- ─── TV Panel Config ─────────────────────────
CREATE TABLE IF NOT EXISTS tv_panel_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL,
  unit_id         UUID,

  display_name      VARCHAR(100),
  logo_path         VARCHAR(500),
  welcome_message   VARCHAR(200),
  theme_color       VARCHAR(7) DEFAULT '#1b4965',
  show_photo        BOOLEAN DEFAULT TRUE,
  show_class_group  BOOLEAN DEFAULT TRUE,
  show_clock        BOOLEAN DEFAULT TRUE,
  auto_hide_seconds INT DEFAULT 8,
  max_visible_cards INT DEFAULT 6,

  filter_direction  VARCHAR(10),
  filter_shift      VARCHAR(20),

  access_token      VARCHAR(64) NOT NULL,
  is_active         BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT fk_tpc_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpc_unit FOREIGN KEY (unit_id) REFERENCES school_units(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tpc_token ON tv_panel_configs(access_token) WHERE is_active = TRUE;

-- ─── Dashboard Widget Config ─────────────────
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        VARCHAR(30) NOT NULL,
  widget_key  VARCHAR(50) NOT NULL,
  position    INT DEFAULT 0,
  size        VARCHAR(10) DEFAULT 'md',
  is_visible  BOOLEAN DEFAULT TRUE,
  config      JSONB DEFAULT '{}',

  CONSTRAINT uq_dw_role_key UNIQUE (role, widget_key)
);

-- ─── Additional Indexes on Existing Tables ──
-- These improve cockpit query performance

-- Events: faster time-range scans by school
CREATE INDEX IF NOT EXISTS idx_ae_school_time ON access_events(school_id, "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS idx_ae_student_time ON access_events(student_id, "occurredAt" DESC);

-- Devices: faster status aggregation
CREATE INDEX IF NOT EXISTS idx_dev_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_dev_heartbeat ON devices(last_heartbeat);

-- Students: faster school-level queries
CREATE INDEX IF NOT EXISTS idx_stu_school_status ON students(school_id, status);

-- Notification jobs: faster status aggregation
CREATE INDEX IF NOT EXISTS idx_nj_status ON notification_jobs(status);

-- ─── Add updatedAt to tables that lack it ────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'updated_at') THEN
    ALTER TABLE students ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guardians' AND column_name = 'updated_at') THEN
    ALTER TABLE guardians ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'updated_at') THEN
    ALTER TABLE devices ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'updated_at') THEN
    ALTER TABLE schools ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ─── Seed widget config ──────────────────────
INSERT INTO dashboard_widgets (role, widget_key, position, size) VALUES
  ('school_admin', 'entries_today', 0, 'sm'),
  ('school_admin', 'attendance_rate', 1, 'sm'),
  ('school_admin', 'notification_failures', 2, 'sm'),
  ('school_admin', 'devices_status', 3, 'sm'),
  ('school_admin', 'hourly_heatmap', 4, 'md'),
  ('school_admin', 'attendance_by_class', 5, 'md'),
  ('school_admin', 'absent_students', 6, 'lg'),
  ('school_admin', 'weekly_trend', 7, 'sm'),
  ('school_admin', 'incidents', 8, 'sm'),
  ('integrator_admin', 'schools_active', 0, 'sm'),
  ('integrator_admin', 'fleet_devices', 1, 'sm'),
  ('integrator_admin', 'events_today', 2, 'sm'),
  ('integrator_admin', 'fleet_uptime', 3, 'sm'),
  ('integrator_admin', 'alerts_count', 4, 'sm'),
  ('integrator_admin', 'school_health_table', 5, 'full'),
  ('integrator_admin', 'fleet_donut', 6, 'md'),
  ('integrator_admin', 'notification_pipeline', 7, 'md'),
  ('superadmin', 'integrators_count', 0, 'sm'),
  ('superadmin', 'schools_count', 1, 'sm'),
  ('superadmin', 'devices_count', 2, 'sm'),
  ('superadmin', 'platform_uptime', 3, 'sm'),
  ('superadmin', 'events_today', 4, 'sm'),
  ('superadmin', 'integrator_ranking', 5, 'full'),
  ('superadmin', 'licensing_overview', 6, 'sm'),
  ('superadmin', 'fleet_global', 7, 'sm'),
  ('superadmin', 'growth_chart', 8, 'sm')
ON CONFLICT (role, widget_key) DO NOTHING;
