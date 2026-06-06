#!/usr/bin/env bash
# Run the same checks as GitHub Actions CI locally.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3}"
VENV="${VENV:-$ROOT/.venv}"

if [[ ! -x "$VENV/bin/python" ]]; then
  "$PY" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

pip install -q -U pip
pip install -q -r requirements-dev.txt
pip install -q -e backend/shared
for svc in auth-service api-gateway user-service contact-service chat-service \
  notification-service presence-service call-service ai-service; do
  pip install -q -r "backend/${svc}/requirements.txt" 2>/dev/null || true
done

echo "==> ruff"
ruff check backend/ tests/

echo "==> pytest (unit, integration, websocket, security, smoke)"
bash scripts/run-tests.sh

echo "==> frontend unit (vitest)"
(
  cd frontend/web
  npm ci 2>/dev/null || npm install
  npm run test
)

echo "==> frontend build"
(
  cd frontend/web
  npm ci 2>/dev/null || npm install
  npm run build
)

echo "==> compose validate"
docker compose -f docker-compose.yml config -q
docker compose -f docker-compose.yml -f docker-compose.prod.yml config -q
docker compose -f docker-compose.yml -f docker-compose.staging.yml config -q

echo "CI local checks passed."
