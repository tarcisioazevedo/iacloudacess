-- init.sql
-- Este script é executado apenas quando o volume de dados do PostgreSQL está vazio (primeira inicialização).
-- O banco de dados definido por POSTGRES_DB (school_access) é criado automaticamente.
-- Aqui, criamos bancos de dados adicionais necessários para o ecossistema.

CREATE DATABASE n8n_data;
GRANT ALL PRIVILEGES ON DATABASE n8n_data TO schooladmin;
