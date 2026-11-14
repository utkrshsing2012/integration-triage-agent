#!/bin/bash
# First-boot init for the Postgres container. Runs once, on an empty data dir.
# Passes the three role passwords from env into psql so the SQL stays plain.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v sandbox_app_password="$SANDBOX_APP_PASSWORD" \
  -v triage_app_password="$TRIAGE_APP_PASSWORD" \
  -v triage_ro_password="$TRIAGE_RO_PASSWORD" \
  -f /docker-entrypoint-initdb.d/sql/01-roles-and-databases.sql \
  -f /docker-entrypoint-initdb.d/sql/02-sandbox-read-only.sql \
  -f /docker-entrypoint-initdb.d/sql/03-triage-vector.sql
