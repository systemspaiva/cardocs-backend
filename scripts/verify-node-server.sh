#!/bin/sh
set -eu

PORT="${PORT:-5055}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}/cardocs-node-server-$$.log"

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
}

trap cleanup EXIT INT TERM

PORT="$PORT" node lib/index.js >"$LOG_FILE" 2>&1 &
SERVER_PID="$!"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "${BASE_URL}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

HEALTH="$(curl -fsS "${BASE_URL}/v1/health")"
case "$HEALTH" in
  *'"status":"UP"'*) echo "NODE_HEALTH_ROUTE=ok" ;;
  *)
    echo "NODE_HEALTH_ROUTE=failed"
    cat "$LOG_FILE"
    exit 1
    ;;
esac

STATUS="$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer invalid" "${BASE_URL}/v1/dashboard")"
if [ "$STATUS" = "401" ]; then
  echo "NODE_INVALID_TOKEN_RETURNS_401=ok"
else
  echo "NODE_INVALID_TOKEN_RETURNS_401=failed_${STATUS}"
  cat "$LOG_FILE"
  exit 1
fi
