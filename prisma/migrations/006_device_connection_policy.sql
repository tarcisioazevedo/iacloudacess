ALTER TABLE devices
ADD COLUMN IF NOT EXISTS connection_policy TEXT;

UPDATE devices
SET connection_policy = CASE
  WHEN connectivity_mode = 'edge' THEN 'edge_only'
  ELSE 'direct_only'
END
WHERE connection_policy IS NULL
   OR BTRIM(connection_policy) = '';

ALTER TABLE devices
ALTER COLUMN connection_policy SET DEFAULT 'auto';

ALTER TABLE devices
ALTER COLUMN connection_policy SET NOT NULL;
