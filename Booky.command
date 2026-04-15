#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

if command -v python3 >/dev/null 2>&1; then
  python3 server.py
elif command -v python >/dev/null 2>&1; then
  python server.py
else
  osascript -e 'display alert "Python not found" message "Install Python 3 to run Booky on this Mac."'
fi
