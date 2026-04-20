-- Migration: 007_device_firmware_cleanup
-- Purpose: Remove duplicate firmware_version column from devices table.
--          The original firmware_ver column is the one used by all application code.
--          firmware_version was accidentally added as a duplicate; this migration
--          copies any non-null data into firmware_ver then drops the column.

DO $$ BEGIN
  -- Only run if the duplicate column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'firmware_version'
  ) THEN
    -- Copy data: if firmware_ver is empty but firmware_version has data, backfill
    UPDATE devices
    SET firmware_ver = firmware_version
    WHERE firmware_ver IS NULL AND firmware_version IS NOT NULL;

    -- Drop the duplicate column
    ALTER TABLE devices DROP COLUMN firmware_version;
  END IF;
END $$;
