#!/usr/bin/env bash
# Local PostgreSQL + Redis via extracted .deb packages (no Docker / no sudo).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"
ROOTFS="$TOOLS/infra-root"
DEB_DIR="$TOOLS/debs"
PGDATA="$ROOT/.dev/pgdata"
PID_DIR="$ROOT/.dev/pids"
LOG_DIR="$ROOT/.dev/logs"
mkdir -p "$TOOLS" "$ROOTFS" "$DEB_DIR" "$PGDATA" "$PID_DIR" "$LOG_DIR"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change-me-postgres-password}"
REDIS_PASSWORD="${REDIS_PASSWORD:-change-me-redis-password}"

if [[ ! -x "$ROOTFS/usr/lib/postgresql/16/bin/postgres" ]]; then
  echo "[infra] Downloading PostgreSQL + Redis packages ..."
  (
    cd "$DEB_DIR"
    apt-get download -qq \
      postgresql-16 postgresql-client-16 libpq5 \
      redis-server redis-tools libatomic1 liblzf1 libjemalloc2 \
      2>/dev/null || apt-get download \
      postgresql-16 postgresql-client-16 libpq5 \
      redis-server redis-tools libatomic1 liblzf1 libjemalloc2
  )
  rm -rf "$ROOTFS"
  mkdir -p "$ROOTFS"
  for deb in "$DEB_DIR"/*.deb; do
    dpkg-deb -x "$deb" "$ROOTFS"
  done
fi

export PATH="$ROOTFS/usr/lib/postgresql/16/bin:$ROOTFS/usr/bin:$PATH"
export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}:$ROOTFS/usr/lib/x86_64-linux-gnu:$ROOTFS/usr/lib"

if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  echo "[infra] Initializing PostgreSQL data dir ..."
  initdb -D "$PGDATA" -U postgres --auth-local=trust --auth-host=scram-sha-256
  mkdir -p "$ROOT/.dev/pg-run"
  cat >>"$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 5432
unix_socket_directories = '${ROOT}/.dev/pg-run'
EOF
  echo "host all all 127.0.0.1/32 trust" >>"$PGDATA/pg_hba.conf"
fi
if ! grep -q "${ROOT}/.dev/pg-run" "$PGDATA/postgresql.conf" 2>/dev/null; then
  mkdir -p "$ROOT/.dev/pg-run"
  cat >>"$PGDATA/postgresql.conf" <<EOF
unix_socket_directories = '${ROOT}/.dev/pg-run'
EOF
fi

if ! pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; then
  echo "[infra] Starting PostgreSQL on 127.0.0.1:5432 ..."
  pg_ctl -D "$PGDATA" -l "$LOG_DIR/postgres.log" start -w -t 60
fi
if [[ -f "$PGDATA/postmaster.pid" ]]; then
  awk 'NR==1{print $1}' "$PGDATA/postmaster.pid" >"$PID_DIR/postgres.pid"
fi

psql -h "$ROOT/.dev/pg-run" -U postgres -d postgres -v ON_ERROR_STOP=1 <<EOSQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'securechat') THEN
    CREATE ROLE securechat LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  END IF;
END \$\$;
EOSQL
for db in auth_db user_db contact_db chat_db media_db story_db emoji_db notification_db; do
  psql -h "$ROOT/.dev/pg-run" -U postgres -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1 \
    || psql -h "$ROOT/.dev/pg-run" -U postgres -d postgres -c "CREATE DATABASE ${db} OWNER securechat"
done

if [[ ! -f "$PID_DIR/redis.pid" ]] || ! kill -0 "$(cat "$PID_DIR/redis.pid")" 2>/dev/null; then
  echo "[infra] Starting Redis on 127.0.0.1:6379 ..."
  mkdir -p "$ROOT/.dev/redis-data"
  cat >"$ROOT/.dev/redis.local.conf" <<EOF
bind 127.0.0.1
port 6379
protected-mode yes
requirepass ${REDIS_PASSWORD}
dir ${ROOT}/.dev/redis-data
EOF
  LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}:$ROOTFS/usr/lib/x86_64-linux-gnu" \
    "$ROOTFS/usr/bin/redis-server" "$ROOT/.dev/redis.local.conf" --daemonize yes
  pgrep -f "redis-server.*redis.local.conf" | head -1 >"$PID_DIR/redis.pid" || true
fi

echo "[infra] PostgreSQL and Redis are up."
