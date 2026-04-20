#!/bin/bash
# ═══════════════════════════════════════════════════
# PostgreSQL Automated Backup Script
# For Docker Swarm deployment of school_postgres
# 
# Features:
# - Compressed pg_dump (gzip)
# - Rotation: 7 daily + 4 weekly
# - Can be run via cron or manually
#
# Usage:
#   chmod +x scripts/backup-postgres.sh
#   ./scripts/backup-postgres.sh
#
# Cron example (daily at 2 AM):
#   0 2 * * * /path/to/scripts/backup-postgres.sh >> /var/log/school-backup.log 2>&1
# ═══════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ─────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/opt/school-backups}"
DB_USER="${DB_USER:-schooladmin}"
DB_NAME="${DB_NAME:-school_access}"
CONTAINER_FILTER="name=school_postgres"
DAILY_RETAIN=7
WEEKLY_RETAIN=4

# ─── Determine container ──────────────────────
CONTAINER=$(docker ps --filter "$CONTAINER_FILTER" --format "{{.Names}}" | head -1)
if [ -z "$CONTAINER" ]; then
  echo "[BACKUP] ERROR: PostgreSQL container not found (filter: $CONTAINER_FILTER)"
  exit 1
fi

# ─── Create directories ───────────────────────
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

# ─── Timestamp ─────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
FILENAME="school_access_${TIMESTAMP}.sql.gz"

echo "[BACKUP] Starting backup at $(date -Iseconds)"
echo "[BACKUP] Container: $CONTAINER"

# ─── Execute pg_dump inside container ──────────
docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --if-exists \
  --clean \
  | gzip > "$BACKUP_DIR/daily/$FILENAME"

SIZE=$(du -h "$BACKUP_DIR/daily/$FILENAME" | cut -f1)
echo "[BACKUP] Daily backup created: $FILENAME ($SIZE)"

# ─── Weekly copy (every Sunday) ────────────────
if [ "$DAY_OF_WEEK" -eq 7 ]; then
  cp "$BACKUP_DIR/daily/$FILENAME" "$BACKUP_DIR/weekly/$FILENAME"
  echo "[BACKUP] Weekly backup copied"
fi

# ─── Rotation: delete old backups ──────────────
# Keep last N daily backups
cd "$BACKUP_DIR/daily"
ls -t school_access_*.sql.gz 2>/dev/null | tail -n +$((DAILY_RETAIN + 1)) | xargs -r rm -f
REMAINING_DAILY=$(ls school_access_*.sql.gz 2>/dev/null | wc -l)
echo "[BACKUP] Daily backups retained: $REMAINING_DAILY/$DAILY_RETAIN"

# Keep last N weekly backups
cd "$BACKUP_DIR/weekly"
ls -t school_access_*.sql.gz 2>/dev/null | tail -n +$((WEEKLY_RETAIN + 1)) | xargs -r rm -f
REMAINING_WEEKLY=$(ls school_access_*.sql.gz 2>/dev/null | wc -l)
echo "[BACKUP] Weekly backups retained: $REMAINING_WEEKLY/$WEEKLY_RETAIN"

echo "[BACKUP] Completed at $(date -Iseconds)"
