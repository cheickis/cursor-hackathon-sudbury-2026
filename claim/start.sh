#!/usr/bin/env bash
# One command to run the whole Cursor credit claim system:
#   - keeps the laptop awake (macOS caffeinate)
#   - starts the Node claim server (claim/server.js)
#   - opens the ngrok tunnel on your static domain
#   - cleans everything up when you press Ctrl+C
#
# Usage:  ./claim/start.sh      (or:  bash claim/start.sh)

set -euo pipefail

# --- config ---------------------------------------------------------------
NGROK_DOMAIN="unrelated-chasing-hyphen.ngrok-free.dev"
PORT="3000"

# Run from this script's own directory so relative paths work.
cd "$(dirname "$0")"

# --- preflight checks -----------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "ERROR: node is not installed."; exit 1; }
command -v ngrok >/dev/null 2>&1 || { echo "ERROR: ngrok is not installed. Run: brew install ngrok"; exit 1; }

# --- cleanup on exit ------------------------------------------------------
SERVER_PID=""
CAFFEINATE_PID=""
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$CAFFEINATE_PID" ] && kill "$CAFFEINATE_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  echo "Stopped. credits.csv is saved at claim/data/credits.csv"
}
trap cleanup EXIT INT TERM

# --- keep the laptop awake (macOS) ----------------------------------------
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dims &
  CAFFEINATE_PID=$!
  echo "Keeping the laptop awake (caffeinate)."
fi

# --- start the claim server ----------------------------------------------
echo "Starting claim server on http://localhost:${PORT} ..."
PORT="$PORT" node server.js &
SERVER_PID=$!

# Give the server a moment, then confirm it's up.
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "ERROR: claim server failed to start. Is port ${PORT} already in use?"
  exit 1
fi

echo ""
echo "=================================================================="
echo "  Claim page (guests):  https://${NGROK_DOMAIN}"
echo "  Local test page:      http://localhost:${PORT}"
echo "  Live stats:           http://localhost:${PORT}/api/stats"
echo "  Source of truth:      claim/data/credits.csv"
echo ""
echo "  Press Ctrl+C to stop everything."
echo "=================================================================="
echo ""

# --- open the tunnel (foreground; Ctrl+C here stops the whole script) -----
ngrok http --url="$NGROK_DOMAIN" "$PORT"
