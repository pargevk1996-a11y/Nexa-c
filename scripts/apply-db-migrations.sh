#!/usr/bin/env bash
# Apply SQL migrations to running Postgres (Compose or local).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-${POSTGRES_USER:-securechat}}"
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-change-me-postgres-password}}"
export PGPASSWORD

psql_base() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"
}

apply_dir() {
  local db="$1"
  local dir="$ROOT/infrastructure/postgres/migrations/$db"
  if [[ ! -d "$dir" ]]; then
    echo "skip: no migrations for $db"
    return 0
  fi
  echo "==> $db"
  for f in $(find "$dir" -maxdepth 1 -name '*.sql' | sort); do
    echo "    $(basename "$f")"
    psql_base -d "$db" -f "$f"
  done
}

echo "Applying database migrations to ${PGHOST}:${PGPORT}..."
apply_dir chat_db
apply_dir auth_db
apply_dir notification_db
echo "Done."
