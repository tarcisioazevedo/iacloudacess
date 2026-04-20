CREATE TABLE IF NOT EXISTS school_messaging_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_id UUID NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'evolution',
  instance_name VARCHAR(120) NOT NULL,
  instance_id UUID NULL,
  instance_status VARCHAR(32) NULL DEFAULT 'created',
  connection_state VARCHAR(32) NULL DEFAULT 'close',
  phone_number VARCHAR(32) NULL,
  owner_jid VARCHAR(128) NULL,
  profile_name VARCHAR(255) NULL,
  profile_status TEXT NULL,
  pairing_code VARCHAR(64) NULL,
  qr_code_payload TEXT NULL,
  last_qr_at TIMESTAMPTZ NULL,
  last_connected_at TIMESTAMPTZ NULL,
  last_disconnected_at TIMESTAMPTZ NULL,
  last_sync_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_school_messaging_instance_name UNIQUE (instance_name),
  CONSTRAINT uq_school_messaging_school_provider UNIQUE (school_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_school_messaging_integrator_provider
  ON school_messaging_channels (integrator_id, provider);

CREATE INDEX IF NOT EXISTS idx_school_messaging_school_connection
  ON school_messaging_channels (school_id, connection_state);

CREATE OR REPLACE FUNCTION set_school_messaging_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_school_messaging_channels_updated_at ON school_messaging_channels;

CREATE TRIGGER trg_school_messaging_channels_updated_at
BEFORE UPDATE ON school_messaging_channels
FOR EACH ROW
EXECUTE FUNCTION set_school_messaging_channels_updated_at();
