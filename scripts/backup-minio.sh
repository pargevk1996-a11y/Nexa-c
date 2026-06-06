#!/usr/bin/env bash
# Mirror MinIO bucket data with mc (MinIO client). Requires mc installed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"
MINIO_ACCESS_KEY="${MINIO_ROOT_USER:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD:-minioadmin-change-me}"
BUCKET="${MINIO_BUCKET:-nexa-media}"
BACKUP_DIR="${MINIO_BACKUP_DIR:-$ROOT/backups/minio}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_DIR}/${BUCKET}_${TIMESTAMP}"

if ! command -v mc >/dev/null; then
  echo "Install MinIO client: https://min.io/docs/minio/linux/reference/minio-mc.html"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
mc alias set nexa-backup "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4
mc mirror "nexa-backup/${BUCKET}" "$DEST"
echo "MinIO mirror -> ${DEST}"
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true
