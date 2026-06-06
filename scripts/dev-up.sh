#!/usr/bin/env bash
# Run backend + frontend locally without Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PID_DIR="$ROOT/.dev/pids"
LOG_DIR="$ROOT/.dev/logs"
NODE_DIR="$ROOT/.tools/node"
mkdir -p "$PID_DIR" "$LOG_DIR" "$ROOT/.tools"

# Load env for CORS etc.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}"

# Without Docker DNS, use loopback for Postgres/Redis (see scripts/dev-infra-up.sh)
if ! getent hosts postgres >/dev/null 2>&1; then
  _pg_user="${POSTGRES_USER:-securechat}"
  _pg_pass="${POSTGRES_PASSWORD:-change-me-postgres-password}"
  _redis_pass="${REDIS_PASSWORD:-change-me-redis-password}"
  export AUTH_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/auth_db"
  export USER_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/user_db"
  export CONTACT_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/contact_db"
  export CHAT_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/chat_db"
  export MEDIA_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/media_db"
  export STORY_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/story_db"
  export EMOJI_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/emoji_db"
  export NOTIFICATION_DATABASE_URL="postgresql+asyncpg://${_pg_user}:${_pg_pass}@127.0.0.1:5432/notification_db"
  export REDIS_URL="redis://:${_redis_pass}@127.0.0.1:6379/0"
fi

# Local dev: always use loopback (override Docker hostnames from .env)
export AUTH_SERVICE_URL=http://127.0.0.1:8001
export USER_SERVICE_URL=http://127.0.0.1:8002
export CONTACT_SERVICE_URL=http://127.0.0.1:8003
export CHAT_SERVICE_URL=http://127.0.0.1:8004
export MEDIA_SERVICE_URL=http://127.0.0.1:8005
export STORY_SERVICE_URL=http://127.0.0.1:8006
export EMOJI_SERVICE_URL=http://127.0.0.1:8007
export NOTIFICATION_SERVICE_URL=http://127.0.0.1:8008
export WS_GATEWAY_PORT=8009
export PRESENCE_SERVICE_PORT=8010
export CHAT_SERVICE_URL=http://127.0.0.1:8004
export WS_SERVICE_URL=http://127.0.0.1:8009
export PRESENCE_SERVICE_URL=http://127.0.0.1:8010
export CALL_SERVICE_URL=http://127.0.0.1:8011
export AI_SERVICE_URL=http://127.0.0.1:8012
export AI_MODERATION_ENABLED="${AI_MODERATION_ENABLED:-true}"
export AUTO_VERIFY_EMAIL="${AUTO_VERIFY_EMAIL:-true}"
export FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:5173}"
export OAUTH_PUBLIC_BASE_URL="${OAUTH_PUBLIC_BASE_URL:-http://127.0.0.1:8000}"

# Bundled Node.js (no system npm required)
if [[ ! -x "$NODE_DIR/bin/npm" ]]; then
  echo "[node] Installing Node.js to .tools/node ..."
  NODE_VERSION="v22.12.0"
  ARCH="linux-x64"
  TARBALL="node-${NODE_VERSION}-${ARCH}.tar.xz"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}" -o "$ROOT/.tools/${TARBALL}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$ROOT/.tools/${TARBALL}" "https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"
  else
    "$ROOT/.venv/bin/python" -c "
import urllib.request
urllib.request.urlretrieve(
    'https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}',
    '$ROOT/.tools/${TARBALL}',
)
"
  fi
  tar -xJf "$ROOT/.tools/${TARBALL}" -C "$ROOT/.tools"
  rm -rf "$NODE_DIR"
  mv "$ROOT/.tools/node-${NODE_VERSION}-${ARCH}" "$NODE_DIR"
  rm -f "$ROOT/.tools/${TARBALL}"
fi
export PATH="$NODE_DIR/bin:$PATH"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -U pip
  .venv/bin/pip install -q -e backend/shared
fi

start_service() {
  local name="$1"
  local port="$2"
  if [[ -f "$PID_DIR/$name.pid" ]] && kill -0 "$(cat "$PID_DIR/$name.pid")" 2>/dev/null; then
    echo "[$name] already running"
    return
  fi
  echo "[$name] starting on :$port"
  .venv/bin/pip install -q -r "backend/$name/requirements.txt" 2>/dev/null || true
  (
    cd "backend/$name"
    if [[ "$name" == "api-gateway" ]]; then
      export CORS_ORIGINS AUTH_SERVICE_URL USER_SERVICE_URL CONTACT_SERVICE_URL
      export CHAT_SERVICE_URL MEDIA_SERVICE_URL STORY_SERVICE_URL EMOJI_SERVICE_URL
      export NOTIFICATION_SERVICE_URL
      export CALL_SERVICE_URL AI_SERVICE_URL
    fi
    if [[ "$name" == "auth-service" || "$name" == "ws-gateway" || "$name" == "api-gateway" ]]; then
      export JWT_ACCESS_SECRET JWT_REFRESH_SECRET JWT_ALGORITHM
      export JWT_ACCESS_PUBLIC_KEY_FILE JWT_ACCESS_PUBLIC_KEY
      export JWT_ACCESS_PRIVATE_KEY_FILE
    fi
    if [[ "$name" == "auth-service" ]]; then
      export AUTO_VERIFY_EMAIL FRONTEND_URL OAUTH_PUBLIC_BASE_URL
      export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET
    fi
    if [[ "$name" == "ws-gateway" ]]; then
      export REDIS_URL CHAT_SERVICE_URL WS_NODE_ID
    fi
    exec "$ROOT/.venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port "$port"
  ) >"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$PID_DIR/$name.pid"
}

SERVICES=(
  "auth-service:8001"
  "user-service:8002"
  "contact-service:8003"
  "chat-service:8004"
  "media-service:8005"
  "story-service:8006"
  "emoji-service:8007"
  "notification-service:8008"
  "ws-gateway:8009"
  "presence-service:8010"
  "call-service:8011"
  "ai-service:8012"
  "api-gateway:8000"
)

for entry in "${SERVICES[@]}"; do
  start_service "${entry%%:*}" "${entry##*:}"
done

# Frontend (Vite)
if [[ -f "$PID_DIR/frontend.pid" ]] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
  echo "[frontend] already running"
else
  echo "[frontend] npm install + vite on :5173"
  (cd "$ROOT/frontend/web" && npm install --silent)
  (
    cd "$ROOT/frontend/web"
    exec npm run dev -- --host 0.0.0.0 --port 5173
  ) >"$LOG_DIR/frontend.log" 2>&1 &
  echo $! >"$PID_DIR/frontend.pid"
fi

sleep 3
echo ""
echo "Secure Chat — local dev"
echo "  UI:           http://localhost:5173"
echo "  API Gateway:  http://localhost:8000/health"
echo "  WebSocket:    ws://localhost:5173/api/v1/ws (via Vite → :8009)"
echo "  Redis:        required for multi-node fan-out; ws-gateway falls back to in-memory if Redis is down"
echo "  Logs:         $LOG_DIR/"
if [[ -z "${GOOGLE_CLIENT_ID:-}" && -z "${GITHUB_CLIENT_ID:-}" ]]; then
  echo ""
  echo "  OAuth: NOT CONFIGURED — add GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID to .env"
  echo "        then run: make dev-down && make dev-up"
  echo "        Redirect URIs: http://127.0.0.1:8000/api/v1/auth/oauth/{google|github}/callback"
fi
echo ""
echo "Stop: make dev-down"
