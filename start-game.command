#!/usr/bin/env bash
# Double-clickable launcher for macOS. Opens in Terminal.app.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
bash "$DIR/scripts/start-game.sh"
status=$?
if [ $status -ne 0 ]; then
  echo ""
  echo "Launcher exited with status $status. Press any key to close."
  read -n 1 -s -r
fi
exit $status
