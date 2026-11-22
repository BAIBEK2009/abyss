#!/bin/bash
# ABYSS · double-click in Finder: starts the game server and opens the browser at http://127.0.0.1:8765
# Needs only Python 3.9+ (the project's .venv is used when it exists). Close this window to stop the game.
cd "$(dirname "$0")" || exit 1
PORT="${ABYSS_PORT:-8765}"
URL="http://127.0.0.1:$PORT/"

if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
else
  echo "ABYSS: Python 3 не найден. Установите его с https://www.python.org/downloads/ и запустите снова."
  read -r -p "Нажмите Enter, чтобы закрыть окно…"
  exit 1
fi

# already running (a second double-click): just open the browser
if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state" 2>/dev/null; then
  echo "ABYSS уже запущена: $URL"
  open "$URL"
  exit 0
fi

echo "ABYSS: запускаю сервер ($PY) — $URL"
echo "Чтобы выйти, закройте это окно или нажмите Ctrl+C."
"$PY" main.py --no-browser --port "$PORT" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state" 2>/dev/null && break
  sleep 0.2
done
open "$URL"
wait $SERVER
