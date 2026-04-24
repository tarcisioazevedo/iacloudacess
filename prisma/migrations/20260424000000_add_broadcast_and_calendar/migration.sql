-- AlterTable
ALTER TABLE "schools" ADD COLUMN "absence_alert_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "absence_alert_cutoff_time" TEXT NOT NULL DEFAULT '08:30',
ADD COLUMN "absence_alert_days" TEXT[] DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri']::TEXT[],
ADD COLUMN "absence_alert_template" TEXT,
ADD COLUMN "absence_report_email" TEXT;

-- CreateTable
CREATE TABLE "school_calendar_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "end_date" DATE,
    "event_type" TEXT NOT NULL DEFAULT 'holiday',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_broadcasts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "target_scope" TEXT NOT NULL DEFAULT 'all',
    "target_filter" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_deliveries" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_calendar_events_school_id_event_date_idx" ON "school_calendar_events"("school_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "school_calendar_events_school_id_event_date_title_key" ON "school_calendar_events"("school_id", "event_date", "title");

-- CreateIndex
CREATE INDEX "school_broadcasts_school_id_status_idx" ON "school_broadcasts"("school_id", "status");

-- CreateIndex
CREATE INDEX "school_broadcasts_status_scheduled_at_idx" ON "school_broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_broadcast_id_status_idx" ON "broadcast_deliveries"("broadcast_id", "status");

-- AddForeignKey
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_broadcasts" ADD CONSTRAINT "school_broadcasts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "school_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
