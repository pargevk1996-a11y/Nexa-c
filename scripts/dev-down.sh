#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.dev/pids"

if [[ ! -d "$PID_DIR" ]]; then
  echo "No dev processes."
  exit 0
fi

for pidfile in "$PID_DIR"/*.pid; do
  [[ -f "$pidfile" ]] || continue
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    echo "Stopped $name (pid $pid)"
  fi
  rm -f "$pidfile"
done
