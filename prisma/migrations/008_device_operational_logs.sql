CREATE TABLE IF NOT EXISTS device_operational_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NULL,
  outcome TEXT NULL,
  message TEXT NOT NULL,
  request_id TEXT NULL,
  correlation_id TEXT NULL,
  integrator_id TEXT NULL,
  school_id TEXT NULL,
  school_unit_id TEXT NULL,
  school_name TEXT NULL,
  device_id TEXT NULL,
  device_name TEXT NULL,
  device_ref TEXT NULL,
  event_id TEXT NULL,
  event_code TEXT NULL,
  transport TEXT NULL,
  metadata JSONB NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_device_operational_logs_created_at
ON device_operational_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_operational_logs_device
ON device_operational_logs (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_operational_logs_request
ON device_operational_logs (request_id);

CREATE INDEX IF NOT EXISTS idx_device_operational_logs_source_level
ON device_operational_logs (source, level, created_at DESC);
