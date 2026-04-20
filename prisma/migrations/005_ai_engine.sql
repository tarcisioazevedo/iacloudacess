-- AI Config: tenant-wide (school_id IS NULL) or per-school override (school_id IS SET)
CREATE TABLE IF NOT EXISTS "ai_configs" (
  "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  "integrator_id"        UUID        NOT NULL REFERENCES "integrators"("id") ON DELETE CASCADE,
  "school_id"            UUID        REFERENCES "schools"("id") ON DELETE CASCADE,
  "primary_provider"     TEXT        NOT NULL DEFAULT 'gemini',
  "gemini_api_key"       TEXT,
  "openai_api_key"       TEXT,
  "gemini_model"         TEXT        NOT NULL DEFAULT 'gemini-2.5-flash-preview-04-17',
  "openai_model"         TEXT        NOT NULL DEFAULT 'gpt-4o-mini',
  "monthly_token_quota"  INT         NOT NULL DEFAULT 500000,
  "used_tokens_month"    INT         NOT NULL DEFAULT 0,
  "quota_reset_at"       TIMESTAMPTZ,
  "cache_enabled"        BOOLEAN     NOT NULL DEFAULT TRUE,
  "cache_ttl_minutes"    INT         NOT NULL DEFAULT 60,
  "enabled"              BOOLEAN     NOT NULL DEFAULT FALSE,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ai_configs_integrator_school'
  ) THEN
    ALTER TABLE "ai_configs"
      ADD CONSTRAINT "uq_ai_configs_integrator_school" UNIQUE ("integrator_id", "school_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_configs_integrator ON "ai_configs"("integrator_id");

-- AI Query audit log
CREATE TABLE IF NOT EXISTS "ai_query_logs" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "ai_config_id"  UUID        NOT NULL REFERENCES "ai_configs"("id") ON DELETE CASCADE,
  "provider"      TEXT        NOT NULL,
  "model"         TEXT        NOT NULL,
  "query_type"    TEXT        NOT NULL,
  "prompt_tokens" INT         NOT NULL DEFAULT 0,
  "reply_tokens"  INT         NOT NULL DEFAULT 0,
  "latency_ms"    INT         NOT NULL DEFAULT 0,
  "cached"        BOOLEAN     NOT NULL DEFAULT FALSE,
  "error_code"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_config_date ON "ai_query_logs"("ai_config_id", "created_at" DESC);

-- AI Report cache (avoid redundant LLM calls)
CREATE TABLE IF NOT EXISTS "ai_report_caches" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "cache_key"    TEXT        NOT NULL UNIQUE,
  "report_type"  TEXT        NOT NULL,
  "payload"      JSONB       NOT NULL,
  "expires_at"   TIMESTAMPTZ NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS idx_ai_report_caches_expires ON "ai_report_caches"("expires_at");
