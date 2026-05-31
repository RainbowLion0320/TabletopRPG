#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

URL="http://127.0.0.1:5273"

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

test_server() {
  if command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null -m 1 -w "%{http_code}" "$URL" 2>/dev/null | grep -Eq "^[2-4][0-9][0-9]$"
  else
    return 1
  fi
}

wait_then_open() {
  (
    for _ in $(seq 1 80); do
      if test_server; then
        open_url
        exit 0
      fi
      sleep 0.5
    done
    open_url
  ) &
}

echo ""
echo "TabletopRPG launcher"
echo "Project: $ROOT"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Please install Node.js first: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please reinstall Node.js with npm enabled."
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "Dependencies are missing. Running npm install..."
  npm install
  echo ""
fi

if test_server; then
  echo "The game server is already running."
  echo "Opening browser: $URL"
  open_url
  exit 0
fi

echo "Starting the game..."
echo "The browser will open automatically when the server is ready."
echo "If it does not, visit: $URL"
echo ""
echo "Keep this window open while playing. Close it to stop the game server."
echo ""

wait_then_open
npm run start:game
