#!/usr/bin/env bash
# Restore a single database from a pg_dump .sql.gz produced by backup-postgres.sh.
# Usage: ./scripts/restore-postgres.sh chat_db backups/postgres/chat_db_20260101T120000Z.sql.gz
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_NAME="${1:?database name required}"
DUMP_FILE="${2:?dump file .sql.gz required}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PGHOST="${POSTGRES_HOST:-postgres}"
PGPORT="${POSTGRES_PORT:-5432}"
PGUSER="${POSTGRES_USER:-securechat}"
export PGPASSWORD="${POSTGRES_PASSWORD:-change-me-postgres-password}"

echo "Restoring ${DB_NAME} from ${DUMP_FILE} to ${PGHOST}:${PGPORT}"
read -r -p "This will overwrite ${DB_NAME}. Continue? [y/N] " confirm
[[ "${confirm,,}" == "y" ]] || exit 1

gunzip -c "$DUMP_FILE" | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1
echo "Restore complete. Run: make db-migrate"
