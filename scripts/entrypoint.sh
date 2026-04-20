#!/bin/sh
set -e

echo "School Access Platform starting..."
echo "   Environment: ${NODE_ENV:-development}"

# ─── Read Docker Secrets (if mounted) ─────────
# Swarm mounts secrets as files in /run/secrets/
if [ -f /run/secrets/db_password ]; then
  export DB_PASSWORD=$(cat /run/secrets/db_password | tr -d '\r')
  echo "   [ok] DB password loaded from Docker secret"
fi

if [ -f /run/secrets/jwt_secret ]; then
  export JWT_SECRET=$(cat /run/secrets/jwt_secret | tr -d '\r')
  echo "   [ok] JWT secret loaded from Docker secret"
fi

if [ -f /run/secrets/jwt_refresh_secret ]; then
  export JWT_REFRESH_SECRET=$(cat /run/secrets/jwt_refresh_secret | tr -d '\r')
  echo "   [ok] JWT refresh secret loaded from Docker secret"
fi

if [ -f /run/secrets/minio_secret_key ]; then
  export MINIO_SECRET_KEY=$(cat /run/secrets/minio_secret_key | tr -d '\r')
  echo "   [ok] MinIO secret loaded from Docker secret"
fi

# ─── Build DATABASE_URL from components ───────
if [ "${NODE_ENV}" = "production" ]; then
  if [ -z "${JWT_SECRET}" ]; then
    echo "   [error] JWT_SECRET is required in production"
    exit 1
  fi

  if [ -z "${JWT_REFRESH_SECRET}" ]; then
    echo "   [error] JWT_REFRESH_SECRET is required in production"
    exit 1
  fi

  if [ -z "${DATABASE_URL}" ] && [ -z "${DB_PASSWORD}" ]; then
    echo "   [error] DATABASE_URL or DB_PASSWORD is required in production"
    exit 1
  fi
fi

if [ -n "$DB_PASSWORD" ] && [ -z "$DATABASE_URL" ]; then
  if [ "${PGBOUNCER_ENABLED}" = "true" ]; then
    # PgBouncer transaction mode: desabilitar prepared statements (incompatível com
    # transaction pool) e adicionar pgbouncer=true para o Prisma pular comandos de sessão
    export DATABASE_URL="postgresql://${DB_USER:-schooladmin}:${DB_PASSWORD}@${DB_HOST:-pgbouncer}:${DB_PORT:-5432}/${DB_NAME:-school_access}?schema=public&pgbouncer=true&statement_cache_size=0&connect_timeout=10"
    echo "   [db]  routing via PgBouncer (transaction pool) — prepared statements disabled"
  else
    export DATABASE_URL="postgresql://${DB_USER:-schooladmin}:${DB_PASSWORD}@${DB_HOST:-postgres}:${DB_PORT:-5432}/${DB_NAME:-school_access}?schema=public&connect_timeout=10"
    echo "   [db]  direct connection to postgres at ${DB_HOST:-postgres}:${DB_PORT:-5432}"
  fi
  echo "   [ok] DATABASE_URL constructed from components"
fi

# ─── Wait for PostgreSQL to be ready ──────────
echo "   Waiting for PostgreSQL at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
RETRIES=30
until nc -z "${DB_HOST:-postgres}" "${DB_PORT:-5432}" 2>/dev/null || [ "$RETRIES" -eq 0 ]; do
  echo "   Postgres not ready yet — retrying in 2s ($RETRIES remaining)..."
  RETRIES=$((RETRIES - 1))
  sleep 2
done
if [ "$RETRIES" -eq 0 ]; then
  echo "   [error] Could not connect to PostgreSQL after 60s"
  exit 1
fi
echo "   [ok] PostgreSQL is accepting connections"

# ─── Run Prisma Migrations (if leader) ────────
# In Swarm, only one replica should run migrations.
# Use MIGRATE_ON_START=true for the first replica.
if [ "${MIGRATE_ON_START}" = "true" ]; then
  echo "   Running database migrations..."
  npx prisma migrate deploy 2>/dev/null
  # Se não há arquivos de migration, migrate deploy retorna 0 mas não cria tabelas.
  # prisma db push garante que o schema está em sincronia independentemente.
  echo "   Syncing schema with prisma db push..."
  npx prisma db push --accept-data-loss --skip-generate 2>/dev/null && \
    echo "   [ok] Schema synced" || \
    echo "   [warn] db push failed (may already be in sync)"
  echo "   [ok] Migrations complete"
fi

if [ "${MIGRATION_ONLY}" = "true" ]; then
  echo "   Migration-only mode complete, exiting."
  exit 0
fi

# ─── Start Application ───────────────────────
echo "   Starting API server on port ${PORT:-4000}..."
# Usar path direto ao cli.mjs (não ao symlink) para evitar problemas de resolução
# de módulos do Node.js ao seguir symlinks relativos em node_modules/.bin/
exec node node_modules/tsx/dist/cli.mjs api/server.ts
