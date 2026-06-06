#!/usr/bin/env bash
# Run Python test suites (default excludes load and e2e per pytest.ini).
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
  ws-gateway notification-service presence-service call-service ai-service; do
  pip install -q -r "backend/${svc}/requirements.txt" 2>/dev/null || true
done

MARKERS="${TEST_MARKERS:-not load and not e2e}"
echo "==> pytest (-m '${MARKERS}')"
pytest tests/ -v -m "${MARKERS}" "$@"
