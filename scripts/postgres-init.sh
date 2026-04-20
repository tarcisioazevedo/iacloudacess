#!/bin/bash
set -e

# Creates additional databases required by other applications on startup
# This runs automatically via /docker-entrypoint-initdb.d when PostgreSQL initializes its pgdata volume

echo "Creating additional databases for Evolution API and N8N..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE evolution' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
    SELECT 'CREATE DATABASE n8n_data' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n_data')\gexec
EOSQL

echo "Done."
