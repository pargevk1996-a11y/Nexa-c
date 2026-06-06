#!/usr/bin/env bash
# Backup all Nexa Postgres databases (pg_dump per DB).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PGHOST="${POSTGRES_HOST:-postgres}"
PGPORT="${POSTGRES_PORT:-5432}"
PGUSER="${POSTGRES_USER:-securechat}"
PGPASSWORD="${POSTGRES_PASSWORD:-change-me-postgres-password}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/postgres}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

export PGPASSWORD
mkdir -p "$BACKUP_DIR"

DATABASES=(auth_db user_db contact_db chat_db media_db story_db emoji_db notification_db)

echo "Backing up Postgres at ${PGHOST}:${PGPORT} -> ${BACKUP_DIR}"
for db in "${DATABASES[@]}"; do
  outfile="${BACKUP_DIR}/${db}_${TIMESTAMP}.sql.gz"
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" --no-owner --format=plain | gzip -9 > "$outfile"
  echo "  ${db} -> ${outfile}"
done

find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true
echo "Retention: ${RETENTION_DAYS} days. Done."
