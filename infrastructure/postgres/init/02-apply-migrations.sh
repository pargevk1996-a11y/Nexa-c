#!/bin/bash
# Runs on first Postgres cluster init (docker-entrypoint-initdb.d).
set -euo pipefail

MIGRATIONS_ROOT="/docker-entrypoint-initdb.d/migrations"
PSQL="psql -v ON_ERROR_STOP=1 -U ${POSTGRES_USER:-securechat}"

run_db() {
  local db="$1"
  local dir="${MIGRATIONS_ROOT}/${db}"
  if [[ ! -d "$dir" ]]; then
    return 0
  fi
  echo "Applying ${db} migrations..."
  for f in $(find "$dir" -maxdepth 1 -name '*.sql' | sort); do
    echo "  $(basename "$f")"
    $PSQL -d "$db" -f "$f"
  done
}

run_db auth_db
run_db user_db
run_db chat_db
run_db notification_db
